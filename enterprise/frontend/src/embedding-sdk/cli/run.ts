import chalk from "chalk";

import {
  PREMIUM_TOKEN_REQUIRED_MESSAGE,
  getMetabaseInstanceSetupCompleteMessage,
} from "./constants/messages";
import {
  addDatabaseConnectionStep,
  checkIfReactProject,
  checkIsDockerRunning,
  checkSdkAvailable,
  createApiKey,
  createModelsAndXrays,
  generateCredentials,
  generateExpressServerFile,
  generateReactComponentFiles,
  pickDatabaseTables,
  pollMetabaseInstance,
  setupEmbeddingSettings,
  setupLicense,
  setupMetabaseInstance,
  setupPermissions,
  showMetabaseCliTitle,
  startLocalMetabaseContainer,
} from "./steps";
import type { CliState } from "./types/cli";
import { printEmptyLines, printInfo } from "./utils/print";

export const CLI_STEPS = [
  { id: "showMetabaseCliTitle", executeStep: showMetabaseCliTitle },
  { id: "checkIfReactProject", executeStep: checkIfReactProject },
  { id: "checkSdkAvailable", executeStep: checkSdkAvailable },
  { id: "checkIsDockerRunning", executeStep: checkIsDockerRunning },
  { id: "generateCredentials", executeStep: generateCredentials },
  {
    id: "startLocalMetabaseContainer",
    executeStep: startLocalMetabaseContainer,
  },
  { id: "pollMetabaseInstance", executeStep: pollMetabaseInstance },
  { id: "setupMetabaseInstance", executeStep: setupMetabaseInstance },
  { id: "createApiKey", executeStep: createApiKey },
  { id: "addDatabaseConnection", executeStep: addDatabaseConnectionStep },
  { id: "pickDatabaseTables", executeStep: pickDatabaseTables },
  { id: "createModelsAndXrays", executeStep: createModelsAndXrays },
  { id: "setupLicense", executeStep: setupLicense },

  // The following steps require the license to be defined first.
  { id: "setupEmbeddingSettings", executeStep: setupEmbeddingSettings },
  { id: "setupPermissions", executeStep: setupPermissions },
  {
    id: "generateReactComponentFiles",
    executeStep: generateReactComponentFiles,
  },
  {
    id: "generateExpressServerFile",
    executeStep: generateExpressServerFile,
  },
] as const;

export async function runCli() {
  let state: CliState = {};

  for (let i = 0; i < CLI_STEPS.length; i++) {
    const { executeStep } = CLI_STEPS[i];
    const [output, nextState] = await executeStep(state);

    if (output.type === "error") {
      console.error(output.message);
      return;
    }

    if (output.type === "success" && output.nextStep) {
      i = CLI_STEPS.findIndex(({ id }) => id === output.nextStep) - 1;
    }

    state = nextState;
  }

  console.log(getMetabaseInstanceSetupCompleteMessage(state.instanceUrl ?? ""));

  if (!state.token) {
    console.log(chalk.bold(PREMIUM_TOKEN_REQUIRED_MESSAGE));
  }

  printEmptyLines(1);
  printInfo("All done! 🚀 You can now embed Metabase into your React app.");
}
