import type { Command } from 'commander';
import { writeFile } from 'node:fs/promises';

export function exportCommand(program: Command): void {
  program
    .command('export')
    .description('Export traces to JSON file')
    .option('-o, --output <path>', 'Output file path', 'traces-export.json')
    .option('--limit <count>', 'Max traces', '1000')
    .option('--sqlite-path <path>', 'SQLite path', '.agenttrace/data.db')
    .action(async (options) => {
      try {
        const { createStorage } = await import('@agenttrace/storage');
        const storage = createStorage({ type: 'sqlite', sqlitePath: options.sqlitePath });
        await storage.initialize();

        const result = await storage.listTraces({}, 1, parseInt(options.limit));
        const exportData = [];
        for (const trace of result.data) {
          const spans = await storage.getSpanTree(trace.traceId);
          exportData.push({ ...trace, spans });
        }

        await writeFile(options.output, JSON.stringify(exportData, null, 2));
        console.log(`✅ Exported ${exportData.length} traces to ${options.output}`);
        await storage.close();
      } catch (err) {
        console.error('❌ Export failed:', err);
        process.exit(1);
      }
    });
}
