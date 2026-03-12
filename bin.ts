import { program } from 'commander';
import { devCommand } from './commands/dev.js';
import { startCommand } from './commands/start.js';
import { proxyCommand } from './commands/proxy.js';
import { exportCommand } from './commands/export.js';
import { initCommand } from './commands/init.js';
import { dashboardCommand } from './commands/dashboard.js';

program
  .name('agenttrace')
  .description('🔮 Observability platform for AI agents')
  .version('0.1.0');

devCommand(program);
startCommand(program);
proxyCommand(program);
exportCommand(program);
initCommand(program);
dashboardCommand(program);

program.parse();
