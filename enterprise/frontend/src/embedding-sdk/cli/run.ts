import {
  addDatabaseConnectionStep,
  askForTenancyColumns,
  askIfHasDatabase,
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
  showPostSetupSteps,
  startLocalMetabaseContainer,
} from "./steps";
import type { CliState, CliStepConfig } from "./types/cli";

const hasValidLicense = (state: CliState) => !!state.token;

export const CLI_STEPS: CliStepConfig[] = [
  { id: "showMetabaseCliTitle", executeStep: showMetabaseCliTitle },
  { id: "checkIfReactProject", executeStep: checkIfReactProject },
  { id: "checkSdkAvailable", executeStep: checkSdkAvailable },
  { id: "checkIsDockerRunning", executeStep: checkIsDockerRunning },
  { id: "askIfHasDatabase", executeStep: askIfHasDatabase },
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
  {
    id: "askForTenancyColumns",
    executeStep: askForTenancyColumns,
    runIf: hasValidLicense,
  },
  {
    id: "setupPermissions",
    executeStep: setupPermissions,

    // We need at least one table with a tenancy column to set up sandboxing.
    runIf: state =>
      hasValidLicense(state) &&
      Object.keys(state.tenancyColumnNames ?? {}).length > 0,
  },
  {
    id: "generateReactComponentFiles",
    executeStep: generateReactComponentFiles,
  },
  {
    id: "generateExpressServerFile",
    executeStep: generateExpressServerFile,

    // When JWT is not enabled, they are not able to login with SSO.
    runIf: hasValidLicense,
  },
  {
    id: "showPostSetupSteps",
    executeStep: showPostSetupSteps,
  },
];

export async function runCli() {
  let state: CliState = {};

  for (let i = 0; i < CLI_STEPS.length; i++) {
    const step = CLI_STEPS[i];

    if (step.runIf && !step.runIf(state)) {
      continue;
    }

    const [output, nextState] = await step.executeStep(state);

    if (output.type === "error") {
      console.error(output.message);
      return;
    }

    if (output.type === "success" && output.nextStep) {
      i = CLI_STEPS.findIndex(({ id }) => id === output.nextStep) - 1;
    }

    state = nextState;
  }
}
