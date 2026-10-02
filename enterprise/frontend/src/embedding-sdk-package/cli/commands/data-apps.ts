import type { Command } from "commander";

import { checkResources } from "../../data-app-resources/check";
import { exportResources } from "../../data-app-resources/export";

type AppRootOptions = { appRoot: string };

/** Adds `name` as a data app command that runs from the app's directory unless `--app-root` says otherwise. */
const addAppCommand = (parent: Command, name: string, description: string) =>
  parent
    .command(name)
    .description(description)
    .option("--app-root <path>", "data app directory", process.cwd());

export function addDataAppsCommands(program: Command) {
  const dataAppsCommand = program
    .command("data-apps")
    .description("manage Metabase data apps");

  addAppCommand(
    dataAppsCommand,
    "print-resources",
    "print what the data app's resources/ files are written from, exported by Metabase, as JSON",
  )
    .argument(
      "[file]",
      "only the definitions in this file, relative to the app directory",
    )
    .action(async (file: string | undefined, { appRoot }: AppRootOptions) => {
      process.stdout.write(`${await exportResources(appRoot, file)}\n`);
    });

  addAppCommand(
    dataAppsCommand,
    "check-resources",
    "check that the data app's resources/ directory backs its query and action definitions",
  ).action(async ({ appRoot }: AppRootOptions) => {
    await checkResources(appRoot);
    process.stdout.write("resources/ backs every definition.\n");
  });
}
