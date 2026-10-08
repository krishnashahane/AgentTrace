import type { Command } from 'commander';
import { execFile } from 'node:child_process';
import { platform } from 'node:os';

export function dashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .description('Open the local AgentTrace dashboard')
    .option('-p, --port <port>', 'Collector port', '4318')
    .action((options: { port: string }) => {
      const port = Number.parseInt(options.port, 10);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Port must be an integer between 1 and 65535');
      }

      const url = `http://127.0.0.1:${port}/`;
      const os = platform();
      const executable = os === 'darwin' ? 'open' : os === 'win32' ? 'cmd' : 'xdg-open';
      const args = os === 'darwin' ? [url] : os === 'win32' ? ['/c', 'start', '', url] : [url];

      execFile(executable, args, (error) => {
        if (error) console.log(`Open manually: ${url}`);
      });
    });
}
