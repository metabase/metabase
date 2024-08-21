import fs from "fs/promises";

import { input } from "@inquirer/prompts";
import { dirname } from "path";

import { getExpressServerGeneratedMessage } from "../constants/messages";
import { getExpressServerSnippet } from "../snippets";
import type { CliStepMethod } from "../types/cli";
import { printError } from "../utils/print";

export const generateExpressServerFile: CliStepMethod = async state => {
  const { instanceUrl, tenancyIsolationEnabled } = state;

  // If tenancy isolation is not enabled, we don't need to generate the Express.js server.
  // We rely on API keys instead of SSO when sandboxing is disabled.
  if (!tenancyIsolationEnabled) {
    return [{ type: "success" }, state];
  }

  if (!instanceUrl) {
    const message = "Missing instance URL.";

    return [{ type: "error", message }, state];
  }

  let filePath: string;

  // eslint-disable-next-line no-constant-condition -- ask until user provides a valid path
  while (true) {
    filePath = await input({
      message: "Where should we save the example Express 'server.js' file?",
      default: ".",
      validate: value => {
        if (!value) {
          return "The path cannot be empty.";
        }

        return true;
      },
    });

    filePath += "/server.js";

    // Create the parent directories if it doesn't already exist.
    try {
      await fs.mkdir(dirname(filePath), { recursive: true });

      break;
    } catch (error) {
      printError(
        `The current path is not writeable. Please pick a different path.`,
      );
    }
  }

  const snippet = getExpressServerSnippet({ instanceUrl });
  await fs.writeFile(filePath, snippet);

  console.log(getExpressServerGeneratedMessage(filePath));

  return [{ type: "done" }, state];
};
