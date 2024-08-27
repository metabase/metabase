import fs from "fs/promises";

import { input } from "@inquirer/prompts";

import { installMockServerDeps } from "embedding-sdk/cli/utils/install-mock-server-deps";

import { MOCK_SERVER_PACKAGE_JSON } from "../constants/mock-server-package-json";
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

  let mockServerDir: string;

  // eslint-disable-next-line no-constant-condition -- ask until user provides a valid path
  while (true) {
    mockServerDir = await input({
      message: "Where should we save the example Express mock server folder?",
      default: "mock-server",
      validate: value => {
        if (!value) {
          return "The path cannot be empty.";
        }

        return true;
      },
    });

    // Create the parent directories if it doesn't already exist.
    try {
      await fs.mkdir(mockServerDir, { recursive: true });

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

  await fs.writeFile(`${mockServerDir}/server.js`, snippet.trim());

  const packageJson = JSON.stringify(MOCK_SERVER_PACKAGE_JSON, null, 2);
  await fs.writeFile(`${mockServerDir}/package.json`, packageJson);

  await installMockServerDeps(mockServerDir);

  return [{ type: "done" }, { ...state, mockServerDir }];
};
