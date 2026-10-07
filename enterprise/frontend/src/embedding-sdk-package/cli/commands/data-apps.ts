import type { Command } from "commander";

import { checkResources } from "../../data-app-resources/check";
import { serializeResources } from "../../data-app-resources/serialize";

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
    "print what the files of the data app's collection are written from, serialized by Metabase, as JSON",
  )
    .argument(
      "[file]",
      "only the definitions in this file, relative to the app directory",
    )
    .action(async (file: string | undefined, { appRoot }: AppRootOptions) => {
      process.stdout.write(`${await serializeResources(appRoot, file)}\n`);
    });

  addAppCommand(
    dataAppsCommand,
    "check-resources",
    "check that the files of the data app's collection, under collections/data_apps/, back its query and action definitions",
  ).action(async ({ appRoot }: AppRootOptions) => {
    await checkResources(appRoot);
    process.stdout.write("The app's collection files back every definition.\n");
  });
}
