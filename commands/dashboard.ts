import type { Command } from 'commander';
import { exec } from 'node:child_process';
import { platform } from 'node:os';

export function dashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .description('Open the agenttrace dashboard')
    .option('-p, --port <port>', 'Dashboard port', '4318')
    .action((options) => {
      const url = `http://localhost:${options.port}`;
      console.log(`🔮 Opening dashboard at ${url}`);

      const os = platform();
      const cmd = os === 'darwin' ? `open "${url}"` : os === 'win32' ? `start "${url}"` : `xdg-open "${url}"`;
      exec(cmd, (err) => {
        if (err) console.log(`   Open manually: ${url}`);
      });
    });
}
