# AgentTrace

AgentTrace is a small, local-first HTTP trace collector for AI-agent runs.

The repository previously described a multi-package observability platform, but the committed source did not contain those packages. This version is intentionally self-contained and documents only the functionality that is actually shipped.

## What it does

AgentTrace runs a local HTTP server that:

- accepts JSON trace objects at `POST /v1/traces`
- stores traces as newline-delimited JSON (JSONL)
- exposes recent traces at `GET /api/traces`
- exposes a health endpoint at `GET /health`
- provides a minimal browser landing page at `GET /`
- exports stored traces to a normal JSON file
- optionally requires a Bearer API key

The default bind address is `127.0.0.1`, so the collector is not exposed to the LAN unless you explicitly choose another host.

## Requirements

- Node.js 20 or newer
- pnpm 9 or npm

## Install and build

Clone the repository, install the development dependencies, and build the CLI:

```bash
pnpm install
pnpm build
```

The compiled executable is written to `dist/bin.js`.

Check the CLI:

```bash
node dist/bin.js --help
```

## Initialize a project

From the project you want to trace:

```bash
node /path/to/AgentTrace/dist/bin.js init
```

This creates:

```text
.agenttracerc.json
.agenttrace/
```

The configuration points to the local collector and JSONL storage.

## Start the collector

```bash
node dist/bin.js start
```

Default address:

```text
http://127.0.0.1:4318
```

Custom settings:

```bash
node dist/bin.js start \
  --port 4318 \
  --host 127.0.0.1 \
  --data-path .agenttrace/traces.jsonl
```

### Authentication

For local development, authentication is optional. For any non-local deployment, set an API key:

```bash
export AGENTTRACE_API_KEY='replace-with-a-long-random-secret'
node dist/bin.js start --host 0.0.0.0
```

Clients must then send:

```http
Authorization: Bearer replace-with-a-long-random-secret
```

The collector also accepts `--api-key`, but an environment variable is preferable because command-line arguments can be visible to other local processes.

## Send a trace

AgentTrace accepts any JSON object. It adds `receivedAt` when the field is missing.

```bash
curl -X POST http://127.0.0.1:4318/v1/traces \
  -H 'content-type: application/json' \
  -d '{
    "traceId": "run-001",
    "name": "flight-search",
    "status": "ok",
    "durationMs": 842,
    "model": "example-model",
    "inputTokens": 320,
    "outputTokens": 91
  }'
```

Successful ingestion returns:

```json
{"accepted":true}
```

The request body is limited to 2 MiB.

## Inspect traces

Open the local page:

```bash
node dist/bin.js dashboard
```

Or open `http://127.0.0.1:4318/` manually.

The API endpoint returns recent traces:

```bash
curl 'http://127.0.0.1:4318/api/traces?limit=100'
```

The limit must be between 1 and 10,000.

Health check:

```bash
curl http://127.0.0.1:4318/health
```

## Export

Export the latest traces from JSONL into a standard JSON array:

```bash
node dist/bin.js export \
  --input .agenttrace/traces.jsonl \
  --output traces-export.json \
  --limit 1000
```

Export files are created with restrictive file permissions where supported by the operating system.

## Storage format

Each stored line is one JSON object:

```text
.agenttrace/
└── traces.jsonl
```

This keeps the collector simple, local, inspectable, and easy to back up. It is not intended to replace a production telemetry database for high-volume workloads.

## HTTP API

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Local status page |
| GET | `/health` | Health check |
| POST | `/v1/traces` | Ingest one JSON trace object |
| GET | `/api/traces?limit=N` | Read recent traces |

When `AGENTTRACE_API_KEY` is set, all of these endpoints require a valid Bearer token.

## Security and reliability

The implementation deliberately keeps the attack surface small:

- no runtime third-party dependencies
- no shell command construction for browser launching
- localhost binding by default
- configurable Bearer authentication
- constant-time API-key comparison
- 2 MiB request-body limit
- bounded trace-query results
- strict port and numeric-limit validation
- atomic config creation with `wx` so an existing config is not overwritten
- trace and export files are written with restrictive permissions where supported

Do not expose the collector publicly without authentication and an appropriate reverse proxy/firewall policy.

## Development

```bash
pnpm typecheck
pnpm build
```

The project intentionally has no test runner or framework integrations at this stage because those were not present in the committed source.

## Project structure

```text
AgentTrace/
├── bin.ts
├── package.json
├── tsconfig.base.json
├── README.md
└── LICENSE
```

## License

Apache License 2.0. See [LICENSE](LICENSE).
