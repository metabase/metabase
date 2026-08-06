import { Command } from "commander";

import { start } from "./actions/start";
import { syncQueriesAction } from "./actions/sync-queries";
import { printError } from "./utils/print";

const program = new Command();

program
  .name("metabase-embedding-sdk-cli")
  .description("Metabase Embedding SDK CLI");

program
  .command("start")
  .description("downloads and starts a local Metabase instance")
  .action(start);

const dataAppsCommand = program
  .command("data-apps")
  .description("manage Metabase data apps");

dataAppsCommand
  .command("sync-queries")
  .description("synchronize data app query definitions as saved questions")
  .option("--app-root <path>", "data app directory", process.cwd())
  .action(({ appRoot }: { appRoot: string }) => syncQueriesAction(appRoot));

program.parseAsync().catch((error: unknown) => {
  printError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
