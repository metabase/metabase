import fs from "fs/promises";

import { input } from "@inquirer/prompts";

import { installMockServerDeps } from "embedding-sdk-package/cli/utils/install-mock-server-deps";

import { MOCK_SERVER_PACKAGE_JSON } from "../constants/mock-server-package-json";
import { getExpressServerSnippet } from "../snippets";
import type { CliStepMethod } from "../types/cli";
import { printError } from "../utils/print";

export const generateExpressServerFile: CliStepMethod = async (state) => {
  const { instanceUrl } = state;

  if (!instanceUrl) {
    const message = "Missing instance URL.";

    return [{ type: "error", message }, state];
  }

  let mockServerDir: string;

   
  while (true) {
    mockServerDir = await input({
      message: "Where should we save the example Express mock server folder?",
      default: "mock-server",
      validate: (value) => {
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
    tenantIdsMap: state.tenantIdsMap,
  });

  await fs.writeFile(`${mockServerDir}/server.js`, snippet.trim());

  const packageJson = JSON.stringify(MOCK_SERVER_PACKAGE_JSON, null, 2);
  await fs.writeFile(`${mockServerDir}/package.json`, packageJson);

  await installMockServerDeps(mockServerDir);

  return [{ type: "done" }, { ...state, mockServerPath: mockServerDir }];
};
