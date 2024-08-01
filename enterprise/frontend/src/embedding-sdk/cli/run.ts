import { ANONYMOUS_TRACKING_INFO } from "embedding-sdk/cli/constants/messages";
import { addEmbeddingToken } from "embedding-sdk/cli/steps/add-embedding-token";
import { checkIsDockerRunning } from "embedding-sdk/cli/steps/check-docker-running";
import { createApiKey } from "embedding-sdk/cli/steps/create-api-key";
import { generateCredentials } from "embedding-sdk/cli/steps/generate-credentials";
import { generateCodeSample } from "embedding-sdk/cli/steps/get-code-sample";
import { pollMetabaseInstance } from "embedding-sdk/cli/steps/poll-metabase-instance";
import { setupMetabaseInstance } from "embedding-sdk/cli/steps/setup-metabase-instance";
import { showMetabaseCliTitle } from "embedding-sdk/cli/steps/show-metabase-cli-title";
import { startLocalMetabaseContainer } from "embedding-sdk/cli/steps/start-local-metabase-container";
import { printEmptyLines, printInfo } from "embedding-sdk/cli/utils/print";

import { checkIfReactProject } from "./steps/check-if-react-project";
import { checkSdkAvailable } from "./steps/check-sdk-available";
import type { CliState } from "./types/cli";

export const CLI_STEPS = {
  showMetabaseCliTitle,
  checkIfReactProject,
  checkSdkAvailable,
  addEmbeddingToken,
  checkIsDockerRunning,
  generateCredentials,
  startLocalMetabaseContainer,
  pollMetabaseInstance,
  setupMetabaseInstance,
  createApiKey,
  generateCodeSample,
};

export async function runCli() {
  let state: CliState = {};

  for (let i = 0; i < Object.values(CLI_STEPS).length; i++) {
    const step = Object.values(CLI_STEPS)[i];
    const [output, nextState] = await step(state);

    if (output.type === "error") {
      console.error(output.message);
      return;
    }

    if (output.type === "success" && output.nextStep) {
      i = Object.keys(CLI_STEPS).indexOf(output.nextStep) - 1;
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
