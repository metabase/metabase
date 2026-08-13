import type { Command } from "commander";

import { syncQueriesAction } from "../actions/sync-queries";

export function addDataAppsCommands(program: Command) {
  const dataAppsCommand = program
    .command("data-apps")
    .description("manage Metabase data apps");

  dataAppsCommand
    .command("sync-queries")
    .description("synchronize data app query definitions as saved questions")
    .option("--app-root <path>", "data app directory", process.cwd())
    .action(({ appRoot }: { appRoot: string }) => syncQueriesAction(appRoot));
}
