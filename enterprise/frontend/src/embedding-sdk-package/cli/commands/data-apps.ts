import type { Command } from "commander";

import { repositorySchemaAction } from "../actions/repository-schema";
import { syncResourcesAction } from "../actions/sync-resources";

export function addDataAppsCommands(program: Command) {
  const dataAppsCommand = program
    .command("data-apps")
    .description("manage Metabase data apps");

  dataAppsCommand
    .command("sync-resources")
    .description(
      "synchronize data app query and action definitions into its collection",
    )
    .option("--app-root <path>", "data app directory", process.cwd())
    .action(({ appRoot }: { appRoot: string }) => syncResourcesAction(appRoot));

  for (const [name, refreshOnly] of [
    ["generate-schema", false],
    ["refresh-metadata", true],
  ] as const) {
    dataAppsCommand
      .command(name)
      .description(
        refreshOnly
          ? "refresh scoped repository field metadata"
          : "generate a schema from repository representations",
      )
      .option("--database <name-or-id>", "database scope")
      .option(
        "--library-collections <ids>",
        "comma-separated Data library collection IDs or entity IDs",
      )
      .option("--include-data-library", "include the repository Data library")
      .option("--repository-root <path>", "repository directory")
      .option("--app-root <path>", "data app directory", process.cwd())
      .option("--force-refresh", "refresh metadata even when cached")
      .option("--max-age-minutes <minutes>", "maximum snapshot age", "60")
      .action(
        (flags: {
          appRoot: string;
          repositoryRoot?: string;
          database?: string;
          libraryCollections?: string;
          includeDataLibrary?: boolean;
          forceRefresh?: boolean;
          maxAgeMinutes: string;
        }) =>
          repositorySchemaAction(
            {
              ...flags,
              libraryCollections: flags.libraryCollections?.split(","),
              maxAgeMinutes: Number(flags.maxAgeMinutes),
            },
            refreshOnly,
          ),
      );
  }
}
