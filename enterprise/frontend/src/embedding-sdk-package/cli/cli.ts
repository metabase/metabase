import { Command } from "commander";

import { start } from "./actions/start";
import { addDataAppsCommands } from "./commands/data-apps";
import { printError } from "./utils/print";

const program = new Command();

program
  .name("metabase-embedding-sdk-cli")
  .description("Metabase Embedding SDK CLI");

program
  .command("start")
  .description("downloads and starts a local Metabase instance")
  .action(start);

addDataAppsCommands(program);

program.parseAsync().catch((error: unknown) => {
  printError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
