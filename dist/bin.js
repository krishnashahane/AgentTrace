#!/usr/bin/env node

// src/bin.ts
import { program } from "commander";

// src/commands/dev.ts
function devCommand(program2) {
  program2.command("dev").description("Start collector + proxy in development mode").option("-p, --port <port>", "Collector port", "4318").option("--proxy-port <port>", "Proxy port", "4319").option("--storage-path <path>", "SQLite database path", ".agenttrace/data.db").action(async (options) => {
    console.log("\u{1F52E} agenttrace \u2014 Starting in development mode...\n");
    try {
      const { createServer, loadConfig } = await import("@agenttrace/collector");
      const { createStorage } = await import("@agenttrace/storage");
      process.env.AGENTTRACE_PORT = options.port;
      process.env.AGENTTRACE_SQLITE_PATH = options.storagePath;
      process.env.AGENTTRACE_LOG_LEVEL = "debug";
      const config = loadConfig();
      const storage = createStorage({ type: "sqlite", sqlitePath: options.storagePath });
      await storage.initialize();
      const server = await createServer(config, storage);
      await server.listen({ port: parseInt(options.port), host: "0.0.0.0" });
      console.log(`\u{1F4E1} Collector running at http://localhost:${options.port}`);
      const { createProxyServer } = await import("@agenttrace/proxy");
      const proxyServer = createProxyServer({
        port: parseInt(options.proxyPort),
        collectorUrl: `http://localhost:${options.port}`,
        openaiBaseUrl: process.env.OPENAI_REAL_BASE_URL || "https://api.openai.com",
        anthropicBaseUrl: process.env.ANTHROPIC_REAL_BASE_URL || "https://api.anthropic.com",
        debug: true
      });
      proxyServer.listen(parseInt(options.proxyPort), () => {
        console.log(`\u{1F500} Proxy running at http://localhost:${options.proxyPort}`);
        console.log(`
\u{1F4CB} Set these env vars to auto-trace:`);
        console.log(`   OPENAI_BASE_URL=http://localhost:${options.proxyPort}/v1`);
        console.log(`   ANTHROPIC_BASE_URL=http://localhost:${options.proxyPort}/v1`);
        console.log("\n\u{1F3AF} Ready! Press Ctrl+C to stop.\n");
      });
      const shutdown = async () => {
        console.log("\n\u{1F6D1} Shutting down...");
        proxyServer.close();
        await server.close();
        await storage.close();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    } catch (err) {
      console.error("\u274C Failed to start:", err);
      process.exit(1);
    }
  });
}

// src/commands/start.ts
function startCommand(program2) {
  program2.command("start").description("Start the collector server").option("-p, --port <port>", "Server port", "4318").option("--host <host>", "Server host", "0.0.0.0").option("--storage-type <type>", "Storage type (sqlite|postgres)", "sqlite").option("--sqlite-path <path>", "SQLite database path", ".agenttrace/data.db").option("--postgres-url <url>", "PostgreSQL connection URL").option("--api-key <key>", "API key for authentication").action(async (options) => {
    process.env.AGENTTRACE_PORT = options.port;
    process.env.AGENTTRACE_HOST = options.host;
    process.env.AGENTTRACE_STORAGE_TYPE = options.storageType;
    process.env.AGENTTRACE_SQLITE_PATH = options.sqlitePath;
    if (options.postgresUrl) process.env.AGENTTRACE_POSTGRES_URL = options.postgresUrl;
    if (options.apiKey) process.env.AGENTTRACE_API_KEY = options.apiKey;
    try {
      const { createServer, loadConfig } = await import("@agenttrace/collector");
      const { createStorage } = await import("@agenttrace/storage");
      const config = loadConfig();
      const storage = createStorage({ type: config.storageType, sqlitePath: config.sqlitePath });
      await storage.initialize();
      const server = await createServer(config, storage);
      await server.listen({ port: config.port, host: config.host });
      console.log(`\u{1F52E} agenttrace collector running at http://${config.host}:${config.port}`);
      const shutdown = async () => {
        await server.close();
        await storage.close();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    } catch (err) {
      console.error("\u274C Failed to start:", err);
      process.exit(1);
    }
  });
}

// src/commands/proxy.ts
function proxyCommand(program2) {
  program2.command("proxy").description("Start the LLM API proxy for auto-instrumentation").option("-p, --port <port>", "Proxy port", "4319").option("--collector-url <url>", "Collector URL", "http://localhost:4318").option("--debug", "Enable debug logging", false).action(async (options) => {
    try {
      const { createProxyServer } = await import("@agenttrace/proxy");
      const server = createProxyServer({
        port: parseInt(options.port),
        collectorUrl: options.collectorUrl,
        openaiBaseUrl: "https://api.openai.com",
        anthropicBaseUrl: "https://api.anthropic.com",
        debug: options.debug
      });
      server.listen(parseInt(options.port), () => {
        console.log(`\u{1F500} agenttrace proxy running on port ${options.port}`);
        console.log(`   Collector: ${options.collectorUrl}`);
      });
      process.on("SIGINT", () => {
        server.close();
        process.exit(0);
      });
    } catch (err) {
      console.error("\u274C Failed to start proxy:", err);
      process.exit(1);
    }
  });
}

// src/commands/export.ts
import { writeFile } from "fs/promises";
function exportCommand(program2) {
  program2.command("export").description("Export traces to JSON file").option("-o, --output <path>", "Output file path", "traces-export.json").option("--limit <count>", "Max traces", "1000").option("--sqlite-path <path>", "SQLite path", ".agenttrace/data.db").action(async (options) => {
    try {
      const { createStorage } = await import("@agenttrace/storage");
      const storage = createStorage({ type: "sqlite", sqlitePath: options.sqlitePath });
      await storage.initialize();
      const result = await storage.listTraces({}, 1, parseInt(options.limit));
      const exportData = [];
      for (const trace of result.data) {
        const spans = await storage.getSpanTree(trace.traceId);
        exportData.push({ ...trace, spans });
      }
      await writeFile(options.output, JSON.stringify(exportData, null, 2));
      console.log(`\u2705 Exported ${exportData.length} traces to ${options.output}`);
      await storage.close();
    } catch (err) {
      console.error("\u274C Export failed:", err);
      process.exit(1);
    }
  });
}

// src/commands/init.ts
import { writeFile as writeFile2, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
function initCommand(program2) {
  program2.command("init").description("Initialize agenttrace in the current project").action(async () => {
    const cwd = process.cwd();
    console.log("\u{1F52E} Initializing agenttrace...\n");
    const dir = join(cwd, ".agenttrace");
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
      console.log("   \u2705 Created .agenttrace/ directory");
    }
    const configPath = join(cwd, ".agenttracerc.json");
    if (!existsSync(configPath)) {
      await writeFile2(configPath, JSON.stringify({
        collector: { url: "http://localhost:4318" },
        sdk: { batchSize: 50, flushIntervalMs: 5e3 },
        storage: { type: "sqlite", path: ".agenttrace/data.db" }
      }, null, 2) + "\n");
      console.log("   \u2705 Created .agenttracerc.json");
    }
    console.log("\n\u{1F3AF} Next steps:");
    console.log("   1. npm install @agenttrace/sdk-node");
    console.log("   2. npx agenttrace dev");
    console.log("   3. Add tracing: import { Agenttrace } from '@agenttrace/sdk-node'");
  });
}

// src/commands/dashboard.ts
import { exec } from "child_process";
import { platform } from "os";
function dashboardCommand(program2) {
  program2.command("dashboard").description("Open the agenttrace dashboard").option("-p, --port <port>", "Dashboard port", "4318").action((options) => {
    const url = `http://localhost:${options.port}`;
    console.log(`\u{1F52E} Opening dashboard at ${url}`);
    const os = platform();
    const cmd = os === "darwin" ? `open "${url}"` : os === "win32" ? `start "${url}"` : `xdg-open "${url}"`;
    exec(cmd, (err) => {
      if (err) console.log(`   Open manually: ${url}`);
    });
  });
}

// src/bin.ts
program.name("agenttrace").description("\u{1F52E} Observability platform for AI agents").version("0.1.0");
devCommand(program);
startCommand(program);
proxyCommand(program);
exportCommand(program);
initCommand(program);
dashboardCommand(program);
program.parse();
//# sourceMappingURL=bin.js.map