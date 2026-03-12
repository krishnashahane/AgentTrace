import type { Command } from 'commander';

export function devCommand(program: Command): void {
  program
    .command('dev')
    .description('Start collector + proxy in development mode')
    .option('-p, --port <port>', 'Collector port', '4318')
    .option('--proxy-port <port>', 'Proxy port', '4319')
    .option('--storage-path <path>', 'SQLite database path', '.agenttrace/data.db')
    .action(async (options) => {
      console.log('🔮 agenttrace — Starting in development mode...\n');

      try {
        const { createServer, loadConfig } = await import('@agenttrace/collector');
        const { createStorage } = await import('@agenttrace/storage');

        process.env.AGENTTRACE_PORT = options.port;
        process.env.AGENTTRACE_SQLITE_PATH = options.storagePath;
        process.env.AGENTTRACE_LOG_LEVEL = 'debug';

        const config = loadConfig();
        const storage = createStorage({ type: 'sqlite', sqlitePath: options.storagePath });
        await storage.initialize();

        const server = await createServer(config, storage);
        await server.listen({ port: parseInt(options.port), host: '0.0.0.0' });
        console.log(`📡 Collector running at http://localhost:${options.port}`);

        const { createProxyServer } = await import('@agenttrace/proxy');
        const proxyServer = createProxyServer({
          port: parseInt(options.proxyPort),
          collectorUrl: `http://localhost:${options.port}`,
          openaiBaseUrl: process.env.OPENAI_REAL_BASE_URL || 'https://api.openai.com',
          anthropicBaseUrl: process.env.ANTHROPIC_REAL_BASE_URL || 'https://api.anthropic.com',
          debug: true,
        });

        proxyServer.listen(parseInt(options.proxyPort), () => {
          console.log(`🔀 Proxy running at http://localhost:${options.proxyPort}`);
          console.log(`\n📋 Set these env vars to auto-trace:`);
          console.log(`   OPENAI_BASE_URL=http://localhost:${options.proxyPort}/v1`);
          console.log(`   ANTHROPIC_BASE_URL=http://localhost:${options.proxyPort}/v1`);
          console.log('\n🎯 Ready! Press Ctrl+C to stop.\n');
        });

        const shutdown = async () => {
          console.log('\n🛑 Shutting down...');
          proxyServer.close();
          await server.close();
          await storage.close();
          process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
      } catch (err) {
        console.error('❌ Failed to start:', err);
        process.exit(1);
      }
    });
}
