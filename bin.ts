#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';

const VERSION = '0.1.0';
const DEFAULT_PORT = 4318;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_DATA_PATH = '.agenttrace/traces.jsonl';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_API_TRACES = 10_000;

type Options = Record<string, string | boolean>;

function usage(): void {
  console.log(`AgentTrace ${VERSION}

Usage:
  agenttrace init
  agenttrace start [options]
  agenttrace export [options]
  agenttrace dashboard [options]

Commands:
  init        Create a local AgentTrace configuration
  start       Run the local HTTP trace collector
  export      Export stored traces to JSON
  dashboard   Open the local collector in your browser

Start options:
  -p, --port <port>          HTTP port (default: 4318)
      --host <host>          Bind address (default: 127.0.0.1)
      --data-path <path>     JSONL storage path
      --api-key <key>        API key (prefer AGENTTRACE_API_KEY)

Export options:
  -i, --input <path>         JSONL storage path
  -o, --output <path>        JSON output path
      --limit <count>        Maximum traces (default: 1000)

Dashboard options:
  -p, --port <port>          Collector port (default: 4318)

Environment:
  AGENTTRACE_API_KEY         Require Bearer authentication
`);
}

function parseOptions(args: string[]): Options {
  const options: Options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === '--debug') {
      options.debug = true;
      continue;
    }
    const match = arg.match(/^(--[a-z-]+|-p|-i|-o)(?:=(.*))?$/);
    if (!match) throw new Error(`Unknown option: ${arg}`);
    const name = match[1]!;
    const value = match[2] ?? args[++index];
    if (!value || value.startsWith('-')) throw new Error(`Missing value for ${name}`);
    const normalized = name === '-p' ? 'port' : name === '-i' ? 'input' : name === '-o' ? 'output' : name.slice(2);
    options[normalized] = value;
  }
  return options;
}

function option(options: Options, name: string, fallback: string): string {
  const value = options[name];
  return typeof value === 'string' ? value : fallback;
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Port must be an integer between 1 and 65535');
  }
  return port;
}

function parseLimit(value: string): number {
  const limit = Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_API_TRACES) {
    throw new Error(`Limit must be an integer between 1 and ${MAX_API_TRACES}`);
  }
  return limit;
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

function html(response: ServerResponse): void {
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AgentTrace</title>
<style>
body{font-family:system-ui,sans-serif;max-width:1000px;margin:40px auto;padding:0 20px;color:#111}
h1{margin-bottom:6px}p{color:#555}code{background:#f4f4f4;padding:2px 5px;border-radius:4px}
pre{background:#111;color:#eee;padding:16px;border-radius:8px;overflow:auto}
</style>
</head>
<body>
<h1>AgentTrace</h1>
<p>Local-first HTTP trace collector.</p>
<p><a href="/health">Health</a> · <a href="/api/traces">Recent traces</a></p>
<pre>curl -X POST http://127.0.0.1:4318/v1/traces \
  -H 'content-type: application/json' \
  -d '{"traceId":"demo","name":"example","status":"ok"}'</pre>
</body>
</html>`;
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(body);
}

function authenticated(request: IncomingMessage, expected: string | undefined): boolean {
  if (!expected) return true;
  const supplied = request.headers.authorization;
  if (!supplied?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(supplied.slice(7));
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body exceeds 2 MiB');
    chunks.push(part);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) throw new Error('Request body is empty');

  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Trace payload must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

async function tracesFromFile(path: string, limit: number): Promise<unknown[]> {
  try {
    const raw = await readFile(path, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines.slice(Math.max(0, lines.length - limit)).map((line) => JSON.parse(line));
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  dataPath: string,
  apiKey?: string,
): Promise<void> {
  if (!authenticated(request, apiKey)) {
    json(response, 401, { error: 'Unauthorized' });
    return;
  }

  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const path = url.pathname;

  if (method === 'GET' && path === '/') {
    html(response);
    return;
  }

  if (method === 'GET' && path === '/health') {
    json(response, 200, { ok: true });
    return;
  }

  if (method === 'POST' && path === '/v1/traces') {
    const trace = await body(request);
    trace.receivedAt ??= new Date().toISOString();
    await mkdir(dirname(dataPath), { recursive: true });
    await appendFile(dataPath, JSON.stringify(trace) + '\n', { encoding: 'utf8', mode: 0o600 });
    json(response, 202, { accepted: true });
    return;
  }

  if (method === 'GET' && path === '/api/traces') {
    const limit = url.searchParams.get('limit') ?? '1000';
    json(response, 200, await tracesFromFile(dataPath, parseLimit(limit)));
    return;
  }

  json(response, 404, { error: 'Not found' });
}

async function start(options: Options): Promise<void> {
  const port = parsePort(option(options, 'port', String(DEFAULT_PORT)));
  const host = option(options, 'host', DEFAULT_HOST);
  const dataPath = resolve(option(options, 'data-path', DEFAULT_DATA_PATH));
  const apiKey = typeof options['api-key'] === 'string'
    ? options['api-key']
    : process.env.AGENTTRACE_API_KEY;

  await mkdir(dirname(dataPath), { recursive: true });

  const server = createServer((request, response) => {
    void handle(request, response, dataPath, apiKey).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!response.headersSent) json(response, 400, { error: message });
      else response.destroy();
    });
  });

  await new Promise<void>((resolveStart, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolveStart);
  });

  console.log(`AgentTrace listening on http://${host}:${port}`);
  console.log(`Trace storage: ${dataPath}`);
  if (apiKey) console.log('Authentication: Bearer API key enabled');

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  };

  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
}

async function init(): Promise<void> {
  const directory = resolve('.agenttrace');
  const config = resolve('.agenttracerc.json');
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(
      config,
      JSON.stringify({
        collector: { url: 'http://127.0.0.1:4318' },
        storage: { type: 'jsonl', path: '.agenttrace/traces.jsonl' },
      }, null, 2) + '\n',
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
    console.log(`Created ${config}`);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      console.log(`Keeping existing ${config}`);
      return;
    }
    throw error;
  }
}

async function exportTraces(options: Options): Promise<void> {
  const input = resolve(option(options, 'input', DEFAULT_DATA_PATH));
  const output = resolve(option(options, 'output', 'traces-export.json'));
  const limit = parseLimit(option(options, 'limit', '1000'));
  if (input === output) throw new Error('Input and output paths must be different');

  const traces = await tracesFromFile(input, limit);
  await writeFile(output, JSON.stringify(traces, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });
  console.log(`Exported ${traces.length} traces to ${output}`);
}

function dashboard(options: Options): void {
  const port = parsePort(option(options, 'port', String(DEFAULT_PORT)));
  const url = `http://127.0.0.1:${port}/`;
  const os = platform();
  const executable = os === 'darwin' ? 'open' : os === 'win32' ? 'cmd' : 'xdg-open';
  const args = os === 'darwin' ? [url] : os === 'win32' ? ['/c', 'start', '', url] : [url];
  execFile(executable, args, (error) => {
    if (error) console.log(`Open manually: ${url}`);
  });
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    usage();
    return;
  }
  if (command === '--version' || command === '-v') {
    console.log(VERSION);
    return;
  }

  const options = parseOptions(args);
  switch (command) {
    case 'init':
      await init();
      break;
    case 'start':
      await start(options);
      break;
    case 'export':
      await exportTraces(options);
      break;
    case 'dashboard':
      dashboard(options);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
