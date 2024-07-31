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

import { ANONYMOUS_TRACKING_INFO } from "./constants/messages";
import { checkIfReactProject } from "./steps/check-if-react-project";
import { checkSdkAvailable } from "./steps/check-sdk-available";
import {
  CLI_ORDER,
  type CliOutput,
  type CliStep,
  type CliStepMethod,
} from "./types/types";

export const CLI_STEPS: Record<CliStep, CliStepMethod> = {
  TITLE: showMetabaseCliTitle,
  CHECK_REACT_PROJECT: checkIfReactProject,
  CHECK_SDK_VERSION: checkSdkAvailable,
  ADD_EMBEDDING_TOKEN: addEmbeddingToken,
  CHECK_DOCKER_RUNNING: checkIsDockerRunning,
  GENERATE_CREDENTIALS: generateCredentials,
  START_LOCAL_METABASE_CONTAINER: startLocalMetabaseContainer,
  POLL_METABASE_INSTANCE: pollMetabaseInstance,
  SETUP_METABASE_INSTANCE: setupMetabaseInstance,
  CREATE_API_KEY: createApiKey,
  GET_CODE_SAMPLE: generateCodeSample,
};

export const runCli = async () => {
  let state = {};
  for (let i = 0; i < CLI_ORDER.length; i++) {
    const step = CLI_ORDER[i];
    const [output, newState]: CliOutput = await CLI_STEPS[step](state);

    if (output.type === "error") {
      console.error(output.message);
      return;
    }

    if (output.type === "success" && output.nextStep) {
      i = CLI_ORDER.indexOf(output.nextStep) - 1;
    }

    state = newState;
  }

  printEmptyLines(2);
  console.log(ANONYMOUS_TRACKING_INFO);

  printEmptyLines(2);
  printInfo("All done! 🚀 You can now embed Metabase into your React app.");
};
