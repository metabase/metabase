import fs from "fs/promises";

import { input } from "@inquirer/prompts";
import { dirname } from "path";

import { getExpressServerGeneratedMessage } from "../constants/messages";
import { getExpressServerSnippet } from "../snippets";
import type { CliStepMethod } from "../types/cli";
import { printError } from "../utils/print";

export const generateExpressServerFile: CliStepMethod = async state => {
  const { instanceUrl, token } = state;

  // If a valid license token is not present, we don't need to generate the Express.js server.
  // When JWT is not enabled, they are not able to login with SSO.
  if (!token) {
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

  const snippet = getExpressServerSnippet({
    instanceUrl,
    tenantIds: state.tenantIds ?? [],
  });

  await fs.writeFile(filePath, snippet.trim());

  console.log(getExpressServerGeneratedMessage(filePath));

  return [{ type: "done" }, state];
};
