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
  ["showMetabaseCliTitle", showMetabaseCliTitle],
  ["checkIfReactProject", checkIfReactProject],
  ["checkSdkAvailable", checkSdkAvailable],
  ["addEmbeddingToken", addEmbeddingToken],
  ["checkIsDockerRunning", checkIsDockerRunning],
  ["generateCredentials", generateCredentials],
  ["startLocalMetabaseContainer", startLocalMetabaseContainer],
  ["pollMetabaseInstance", pollMetabaseInstance],
  ["setupMetabaseInstance", setupMetabaseInstance],
  ["createApiKey", createApiKey],
  ["generateCodeSample", generateCodeSample],
] as const;

export async function runCli() {
  let state: CliState = {};

  for (let i = 0; i < CLI_STEPS.length; i++) {
    const [_, execute] = CLI_STEPS[i];
    const [output, nextState] = await execute(state);

    if (output.type === "error") {
      console.error(output.message);
      return;
    }

    if (output.type === "success" && output.nextStep) {
      i = CLI_STEPS.findIndex(([stepId]) => stepId === output.nextStep) - 1;
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
