import type { Command } from 'commander';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize agenttrace in the current project')
    .action(async () => {
      const cwd = process.cwd();
      console.log('🔮 Initializing agenttrace...\n');

      const dir = join(cwd, '.agenttrace');
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
        console.log('   ✅ Created .agenttrace/ directory');
      }

      const configPath = join(cwd, '.agenttracerc.json');
      if (!existsSync(configPath)) {
        await writeFile(configPath, JSON.stringify({
          collector: { url: 'http://localhost:4318' },
          sdk: { batchSize: 50, flushIntervalMs: 5000 },
          storage: { type: 'sqlite', path: '.agenttrace/data.db' },
        }, null, 2) + '\n');
        console.log('   ✅ Created .agenttracerc.json');
      }

      console.log('\n🎯 Next steps:');
      console.log('   1. npm install @agenttrace/sdk-node');
      console.log('   2. npx agenttrace dev');
      console.log("   3. Add tracing: import { Agenttrace } from '@agenttrace/sdk-node'");
    });
}
