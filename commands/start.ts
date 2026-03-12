import type { Command } from 'commander';

export function startCommand(program: Command): void {
  program
    .command('start')
    .description('Start the collector server')
    .option('-p, --port <port>', 'Server port', '4318')
    .option('--host <host>', 'Server host', '0.0.0.0')
    .option('--storage-type <type>', 'Storage type (sqlite|postgres)', 'sqlite')
    .option('--sqlite-path <path>', 'SQLite database path', '.agenttrace/data.db')
    .option('--postgres-url <url>', 'PostgreSQL connection URL')
    .option('--api-key <key>', 'API key for authentication')
    .action(async (options) => {
      process.env.AGENTTRACE_PORT = options.port;
      process.env.AGENTTRACE_HOST = options.host;
      process.env.AGENTTRACE_STORAGE_TYPE = options.storageType;
      process.env.AGENTTRACE_SQLITE_PATH = options.sqlitePath;
      if (options.postgresUrl) process.env.AGENTTRACE_POSTGRES_URL = options.postgresUrl;
      if (options.apiKey) process.env.AGENTTRACE_API_KEY = options.apiKey;

      try {
        const { createServer, loadConfig } = await import('@agenttrace/collector');
        const { createStorage } = await import('@agenttrace/storage');

        const config = loadConfig();
        const storage = createStorage({ type: config.storageType, sqlitePath: config.sqlitePath });
        await storage.initialize();

        const server = await createServer(config, storage);
        await server.listen({ port: config.port, host: config.host });
        console.log(`🔮 agenttrace collector running at http://${config.host}:${config.port}`);

        const shutdown = async () => {
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
