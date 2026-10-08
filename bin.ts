#!/usr/bin/env node
import { program } from 'commander';
import { startCommand } from './commands/start.js';
import { exportCommand } from './commands/export.js';
import { initCommand } from './commands/init.js';
import { dashboardCommand } from './commands/dashboard.js';

program
  .name('agenttrace')
  .description('Local trace collector and inspection CLI')
  .version('0.1.0')
  .showSuggestionAfterError();

startCommand(program);
exportCommand(program);
initCommand(program);
dashboardCommand(program);

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
