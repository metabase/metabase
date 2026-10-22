import path from "node:path";

import type { Command } from "commander";

import { getCommentsFilePath } from "../../data-app-dev/comments/file";
import {
  formatCommentPrompt,
  formatCommentsMarkdown,
} from "../../data-app-dev/comments/prompt";
import { CommentsStore } from "../../data-app-dev/comments/store";
import { checkResources } from "../../data-app-resources/check";
import { writeResources } from "../../data-app-resources/serialize";

type AppRootOptions = { appRoot: string };

type CommentsOptions = AppRootOptions & {
  all?: boolean;
  json?: boolean;
  prompt?: string;
  resolve?: string[];
};

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
    "write-resources",
    "regenerate the files of the data app's collection, serialized by Metabase, next to the collection's file",
  ).action(async ({ appRoot }: AppRootOptions) => {
    process.stdout.write(`${await writeResources(appRoot)}\n`);
  });

  addAppCommand(
    dataAppsCommand,
    "comments",
    "print the review comments left on the app in the dev preview, as a prompt any model can act on",
  )
    .option("--all", "include resolved comments")
    .option("--json", "print the raw comments instead of markdown")
    .option("--prompt <id>", "print the prompt for one comment alone")
    .option(
      "--resolve <id>",
      "mark a comment resolved; repeatable",
      (id: string, ids: string[] = []) => [...ids, id],
    )
    .action(({ appRoot, all, json, prompt, resolve }: CommentsOptions) => {
      const store = new CommentsStore(getCommentsFilePath(appRoot));

      for (const id of resolve ?? []) {
        if (!store.update(id, { status: "resolved" })) {
          throw new Error(`No comment ${id}.`);
        }

        process.stdout.write(`Resolved ${id}.\n`);
      }

      if (resolve && resolve.length > 0) {
        return;
      }

      const context = {
        appSlug: path.basename(appRoot),
        appRoot,
        // Whoever reads this may not have the dev server open; the comments file
        // is always there, and the prompt names it too.
        previewOrigin: null,
      };

      if (prompt) {
        const comment = store.find(prompt);

        if (!comment) {
          throw new Error(`No comment ${prompt}.`);
        }

        process.stdout.write(formatCommentPrompt(comment, context));

        return;
      }

      const comments = store.list(all ? undefined : "open");

      process.stdout.write(
        json
          ? `${JSON.stringify(comments, null, 2)}\n`
          : formatCommentsMarkdown(comments, context),
      );
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
