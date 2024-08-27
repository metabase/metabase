import { select } from "@inquirer/prompts";
import { green } from "chalk";

import {
  SDK_LEARN_MORE_MESSAGE,
  getMetabaseInstanceSetupCompleteMessage,
} from "../constants/messages";
import type { CliStepMethod } from "../types/cli";
import { printEmptyLines, printWithPadding } from "../utils/print";

export const showPostSetupSteps: CliStepMethod = async state => {
  const STEP_1 = `
  Generated an example Express.js server directory in "${state.mockServerDir}".
  Start the sample server with ${green(`node server.js`)}.
`;

  const STEP_2 = `
  Import the ${green("<AnalyticsPage />")} component in your React frontend.
`;

  const STEP_3 = getMetabaseInstanceSetupCompleteMessage(
    state.instanceUrl ?? "",
  );

  const POST_SETUP_STEPS = [STEP_1, STEP_2, STEP_3];

  for (const message of POST_SETUP_STEPS) {
    printWithPadding(message);

    await select({
      message: "After this is done, press <Enter> to continue.",
      choices: [{ name: "Continue", value: true }],
    });
  }

  printEmptyLines(1);
  console.log(green(SDK_LEARN_MORE_MESSAGE));

  return [{ type: "success" }, state];
};
