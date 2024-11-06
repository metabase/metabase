import { select } from "@inquirer/prompts";
import toggle from "inquirer-toggle";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";

/**
 * Asks the user first if they have a database to connect to.
 */
export const askIfHasDatabase: CliStepMethod = async state => {
  const hasDatabase = await toggle({
    message:
      "Do you have a database to connect to? This will be used to embed your data.",
    default: true,
  });

  if (hasDatabase) {
    return [{ type: "success" }, state];
  }

  const shouldUseSampleDatabase = await select({
    message:
      "Do you want to use an example database to try out the Embedding SDK?",
    choices: [
      { name: "Use an example database", value: true },
      { name: "Exit setup", value: false },
    ],
  });

  if (shouldUseSampleDatabase) {
    return [{ type: "success" }, { ...state, shouldUseSampleDatabase: true }];
  }

  return [
    {
      type: "error",
      message: "Setup cancelled. You can run the setup again later.",
    },
    state,
  ];
};
