import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Command } from 'commander';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

interface StartOptions {
  port: string;
  host: string;
  dataPath: string;
  apiKey?: string;
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Port must be an integer between 1 and 65535');
  }
  return port;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

function sendHtml(response: ServerResponse): void {
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AgentTrace</title>
<style>
body{font-family:system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 20px;color:#111}
h1{margin-bottom:4px}p{color:#555}code{background:#f4f4f4;padding:2px 5px;border-radius:4px}
pre{white-space:pre-wrap;word-break:break-word;background:#111;color:#eee;padding:16px;border-radius:8px;overflow:auto}
</style>
</head>
<body>
<h1>AgentTrace</h1>
<p>Local trace collector. Send JSON objects to <code>POST /v1/traces</code>.</p>
<p>Health: <a href="/health">/health</a> · Traces: <a href="/api/traces">/api/traces</a></p>
<pre>curl -X POST http://127.0.0.1:4318/v1/traces \
  -H 'content-type: application/json' \
  -d '{"traceId":"demo","name":"example","status":"ok"}'</pre>
</body>
</html>`;
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let total = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error('Request body exceeds 2 MiB');
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) throw new Error('Request body is empty');

  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Trace payload must be a JSON object');
  }

  return value as Record<string, unknown>;
}

function authorized(request: IncomingMessage, expectedApiKey?: string): boolean {
  if (!expectedApiKey) return true;
  return request.headers.authorization === `Bearer ${expectedApiKey}`;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dataPath: string,
  apiKey?: string,
): Promise<void> {
  const method = request.method ?? 'GET';
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;

  if (!authorized(request, apiKey)) {
    sendJson(response, 401, { error: 'Unauthorized' });
    return;
  }

  if (method === 'GET' && path === '/') {
    sendHtml(response);
    return;
  }

  if (method === 'GET' && path === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === 'POST' && path === '/v1/traces') {
    const trace = await readJsonBody(request);
    trace.receivedAt ??= new Date().toISOString();
    await appendFile(dataPath, JSON.stringify(trace) + '\n', { encoding: 'utf8', mode: 0o600 });
    sendJson(response, 202, { accepted: true });
    return;
  }

  if (method === 'GET' && path === '/api/traces') {
    const { readFile } = await import('node:fs/promises');
    try {
      const raw = await readFile(dataPath, 'utf8');
      const traces = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      sendJson(response, 200, traces);
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code === 'ENOENT') {
        sendJson(response, 200, []);
        return;
      }
      throw error;
    }
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

export async function runServer(options: StartOptions): Promise<void> {
  const port = parsePort(options.port);
  await mkdir(dirname(options.dataPath), { recursive: true });

  const server = createHttpServer((request, response) => {
    void handleRequest(request, response, options.dataPath, options.apiKey).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!response.headersSent) sendJson(response, 400, { error: message });
      else response.destroy();
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(port, options.host, () => {
      server.off('error', onError);
      resolve();
    });
  });

  console.log(`AgentTrace listening on http://${options.host}:${port}`);
  console.log(`Trace data: ${options.dataPath}`);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exitCode = 0;
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export function startCommand(program: Command): void {
  program
    .command('start')
    .description('Start the local AgentTrace collector')
    .option('-p, --port <port>', 'HTTP port', '4318')
    .option('--host <host>', 'Bind address', '127.0.0.1')
    .option('--data-path <path>', 'JSONL trace storage path', '.agenttrace/traces.jsonl')
    .option('--api-key <key>', 'Require Bearer authentication for all endpoints')
    .action(async (options: StartOptions) => {
      try {
        await runServer(options);
      } catch (error: unknown) {
        console.error('Failed to start:', error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
