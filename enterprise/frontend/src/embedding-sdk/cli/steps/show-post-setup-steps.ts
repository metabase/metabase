import { select } from "@inquirer/prompts";
import { green } from "chalk";

import {
  SDK_LEARN_MORE_MESSAGE,
  getMetabaseInstanceSetupCompleteMessage,
} from "../constants/messages";
import type { CliStepMethod } from "../types/cli";
import { getExampleComponentImportPath } from "../utils/get-example-component-import-path";
import { getNextJsSetupMessages } from "../utils/get-nextjs-setup-message";
import { checkIsInNextJsProject } from "../utils/nextjs-helpers";
import { printEmptyLines, printWithPadding } from "../utils/print";

export const showPostSetupSteps: CliStepMethod = async state => {
  const isNextJs = await checkIsInNextJsProject();

  const START_SERVER_STEP = `
  Generated an example Express.js server directory in "${state.mockServerPath}".

  Start the sample server.
  ${green(`cd ${state.mockServerPath}`)}
  ${green("npm run start")}
`;

  const REACT_COMPONENT_IMPORT_STEP = `
  Import the component in your React frontend. For example:
  ${green(`import { AnalyticsPage } from "${getExampleComponentImportPath(state.reactComponentPath)}";`)}

  Make sure the import path is valid.
  Depending on your app's directory structure, you may need to move the components to a new directory.

  Then, add the component to your page.
  ${green(`<AnalyticsPage />`)}
`;

  const INSTANCE_READY_STEP = getMetabaseInstanceSetupCompleteMessage(
    state.instanceUrl ?? "",
    state.email ?? "",
    state.password ?? "",
  );

  const POST_SETUP_STEPS = [];

  if (state.token) {
    POST_SETUP_STEPS.push(START_SERVER_STEP);
  }

  if (!isNextJs) {
    POST_SETUP_STEPS.push(REACT_COMPONENT_IMPORT_STEP);
  }

  // Show the Next.js setup messages if the project is using Next.js.
  if (isNextJs) {
    const messages = await getNextJsSetupMessages({
      componentPath: state.reactComponentPath ?? "",

      // Did the project initially have a custom app or root layout file?
      hasNextJsCustomAppOrRootLayout:
        state.hasNextJsCustomAppOrRootLayout ?? false,

      // Did we generate an Express.js server?
      hasExpressJsServer: !!state.token && !!state.mockServerPath,
    });

    POST_SETUP_STEPS.push(...messages);
  }

  POST_SETUP_STEPS.push(INSTANCE_READY_STEP);

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
