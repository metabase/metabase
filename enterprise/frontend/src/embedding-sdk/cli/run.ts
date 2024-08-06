import { METABASE_INSTANCE_SETUP_COMPLETE_MESSAGE } from "./constants/messages";
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
  addDatabaseConnectionStep,
  pickDatabaseTables,
  createModelsAndXrays,
} from "./steps";
import type { CliState } from "./types/cli";
import { printEmptyLines, printInfo } from "./utils/print";

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
  { id: "addDatabaseConnection", executeStep: addDatabaseConnectionStep },
  { id: "pickDatabaseTables", executeStep: pickDatabaseTables },
  { id: "createModelsAndXrays", executeStep: createModelsAndXrays },
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

  console.log(METABASE_INSTANCE_SETUP_COMPLETE_MESSAGE);

  if (!state.token) {
    console.log(
      "  Don't forget to add your premium token to your Metabase instance in the admin settings!",
    );
  }

  printEmptyLines(1);
  printInfo("All done! 🚀 You can now embed Metabase into your React app.");
}
