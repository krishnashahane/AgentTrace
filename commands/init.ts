import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Command } from 'commander';

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize AgentTrace in the current project')
    .action(async () => {
      try {
        const cwd = process.cwd();
        const dir = join(cwd, '.agenttrace');
        await mkdir(dir, { recursive: true });

        const configPath = join(cwd, '.agenttracerc.json');
        if (!existsSync(configPath)) {
          await writeFile(
            configPath,
            JSON.stringify(
              {
                collector: { url: 'http://127.0.0.1:4318' },
                storage: { type: 'jsonl', path: '.agenttrace/traces.jsonl' },
              },
              null,
              2,
            ) + '\n',
            { encoding: 'utf8', flag: 'wx', mode: 0o600 },
          );
          console.log(`Created ${resolve(configPath)}`);
        } else {
          console.log(`Keeping existing ${resolve(configPath)}`);
        }

        console.log('Run: npx agenttrace start');
      } catch (error: unknown) {
        console.error('Initialization failed:', error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
