import type { Command } from 'commander';

export function proxyCommand(program: Command): void {
  program
    .command('proxy')
    .description('Start the LLM API proxy for auto-instrumentation')
    .option('-p, --port <port>', 'Proxy port', '4319')
    .option('--collector-url <url>', 'Collector URL', 'http://localhost:4318')
    .option('--debug', 'Enable debug logging', false)
    .action(async (options) => {
      try {
        const { createProxyServer } = await import('@agenttrace/proxy');
        const server = createProxyServer({
          port: parseInt(options.port),
          collectorUrl: options.collectorUrl,
          openaiBaseUrl: 'https://api.openai.com',
          anthropicBaseUrl: 'https://api.anthropic.com',
          debug: options.debug,
        });

        server.listen(parseInt(options.port), () => {
          console.log(`🔀 agenttrace proxy running on port ${options.port}`);
          console.log(`   Collector: ${options.collectorUrl}`);
        });

        process.on('SIGINT', () => { server.close(); process.exit(0); });
      } catch (err) {
        console.error('❌ Failed to start proxy:', err);
        process.exit(1);
      }
    });
}
