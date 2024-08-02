import { ANONYMOUS_TRACKING_INFO } from "embedding-sdk/cli/constants/messages";
import { printEmptyLines, printInfo } from "embedding-sdk/cli/utils/print";

import {
  addEmbeddingToken,
  checkIsDockerRunning,
  createApiKey,
  generateCredentials,
  generateCodeSample,
  pollMetabaseInstance,
  setupMetabaseInstance,
  showMetabaseCliTitle,
  startLocalMetabaseContainer,
  checkIfReactProject,
  checkSdkAvailable,
} from "./steps";
import type { CliState } from "./types/cli";

export const CLI_STEPS = [
  { id: "showMetabaseCliTitle", executeStep: showMetabaseCliTitle },
  { id: "checkIfReactProject", executeStep: checkIfReactProject },
  { id: "checkSdkAvailable", executeStep: checkSdkAvailable },
  { id: "addEmbeddingToken", executeStep: addEmbeddingToken },
  { id: "checkIsDockerRunning", executeStep: checkIsDockerRunning },
  { id: "generateCredentials", executeStep: generateCredentials },
  {
    id: "startLocalMetabaseContainer",
    executeStep: startLocalMetabaseContainer,
  },
  { id: "pollMetabaseInstance", executeStep: pollMetabaseInstance },
  { id: "setupMetabaseInstance", executeStep: setupMetabaseInstance },
  { id: "createApiKey", executeStep: createApiKey },
  { id: "generateCodeSample", executeStep: generateCodeSample },
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

  printEmptyLines(2);
  console.log(ANONYMOUS_TRACKING_INFO);

  if (!state.token) {
    printEmptyLines(2);
    printInfo(
      "Don't forget to add your premium token to your Metabase instance in the admin settings!",
    );
  }

  printEmptyLines(2);
  printInfo("All done! 🚀 You can now embed Metabase into your React app.");
}
