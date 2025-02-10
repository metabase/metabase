import { select } from "@inquirer/prompts";
import { green } from "chalk";

import {
  SDK_LEARN_MORE_MESSAGE,
  getMetabaseInstanceSetupCompleteMessage,
  getNextJsSetupMessage,
} from "../constants/messages";
import type { CliStepMethod } from "../types/cli";
import { checkIsInNextJsProject } from "../utils/check-nextjs-project";
import { getSuggestedImportPath } from "../utils/get-suggested-import-path";
import { printEmptyLines, printWithPadding } from "../utils/print";

export const showPostSetupSteps: CliStepMethod = async state => {
  const STEP_1 = `
  Generated an example Express.js server directory in "${state.mockServerDir}".

  Start the sample server.
  ${green(`cd ${state.mockServerDir}`)}
  ${green("npm run start")}
`;

  const importPath = getSuggestedImportPath(state.reactComponentDir);

  const STEP_2 = `
  Import the component in your React frontend. For example:
  ${green(`import { AnalyticsPage } from "${importPath}";`)}

  Make sure the import path is valid.
  Depending on your app's directory structure, you may need to move the components to a new directory.

  Then, add the component to your page.
  ${green(`<AnalyticsPage />`)}
`;

  const STEP_3 = getMetabaseInstanceSetupCompleteMessage(
    state.instanceUrl ?? "",
    state.email ?? "",
    state.password ?? "",
  );

  const POST_SETUP_STEPS = [];

  if (state.token) {
    POST_SETUP_STEPS.push(STEP_1);
  }

  POST_SETUP_STEPS.push(STEP_2);

  const isNextJs = await checkIsInNextJsProject();

  if (isNextJs) {
    POST_SETUP_STEPS.push(getNextJsSetupMessage(state.reactComponentDir ?? ""));
  }

  POST_SETUP_STEPS.push(STEP_3);

  for (const message of POST_SETUP_STEPS) {
    printWithPadding(message);

    await select({
      message: "After this is done, press <Enter> to continue.",
      choices: [{ name: "Continue", value: true }],
    });
  }

  printEmptyLines(1);
  printWithPadding(green(SDK_LEARN_MORE_MESSAGE));

  return [{ type: "success" }, state];
};
