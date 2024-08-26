import { select } from "@inquirer/prompts";
import { green } from "chalk";

import { getMetabaseInstanceSetupCompleteMessage } from "../constants/messages";
import type { CliStepMethod } from "../types/cli";
import { printEmptyLines, printInfo, printWithPadding } from "../utils/print";

const STEP_1 = `
  Start the sample server with ${green("node server.js")}.
`;

const STEP_2 = `
  Import the ${green("<AnalyticsPage />")} component in your React frontend.
`;

export const showPostSetupSteps: CliStepMethod = async state => {
  const POST_SETUP_STEPS = [
    STEP_1,
    STEP_2,
    getMetabaseInstanceSetupCompleteMessage(state.instanceUrl ?? ""),
  ];

  for (const message of POST_SETUP_STEPS) {
    printWithPadding(message);

    await select({
      message: "After this is done, press <Enter> to continue.",
      choices: [{ name: "Continue", value: true }],
    });
  }

  printEmptyLines(1);
  printInfo("All done! 🚀 You can now embed Metabase into your React app.");

  return [{ type: "success" }, state];
};
