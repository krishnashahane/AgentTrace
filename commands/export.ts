import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';

function parseLimit(value: string): number {
  const limit = Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) {
    throw new Error('Limit must be an integer between 1 and 100000');
  }
  return limit;
}

export function exportCommand(program: Command): void {
  program
    .command('export')
    .description('Export stored traces to JSON')
    .option('-i, --input <path>', 'JSONL trace storage path', '.agenttrace/traces.jsonl')
    .option('-o, --output <path>', 'Output JSON path', 'traces-export.json')
    .option('--limit <count>', 'Maximum traces to export', '1000')
    .action(async (options: { input: string; output: string; limit: string }) => {
      const input = resolve(options.input);
      const output = resolve(options.output);

      if (input === output) throw new Error('Input and output paths must be different');

      try {
        const raw = await readFile(input, 'utf8');
        const lines = raw.split(/\r?\n/).filter(Boolean);
        const limit = parseLimit(options.limit);
        const traces = lines.slice(Math.max(0, lines.length - limit)).map((line) => JSON.parse(line));
        await writeFile(output, JSON.stringify(traces, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
        console.log(`Exported ${traces.length} traces to ${output}`);
      } catch (error: unknown) {
        console.error('Export failed:', error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
