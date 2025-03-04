import { FAILURE_EXIT_CODE } from "../constants/exit-code";
import { printBold } from "../cypress-runner-utils";
import { SAMPLE_APP_SETUP_CONFIGS } from "../sample-apps-shared/constants/sample-app-setup-configs";
import { fetchApp } from "../sample-apps-shared/helpers/fetch-app";
import {
  copyExampleEnvFile,
  copyLocalEmbeddingSdkPackage,
  copyLocalMetabaseJar,
} from "../sample-apps-shared/helpers/prepare-app";
import { startContainers } from "../sample-apps-shared/helpers/start-containers";
import type {
  EmbeddingSdkVersion,
  SampleAppTestSuiteName,
} from "../sample-apps-shared/types";

const userOptions = {
  EMBEDDING_SDK_VERSION: "local",
  SAMPLE_APP_BRANCH_NAME: "",
  ...process.env,
} as const;

printBold(`Running Cypress Sample App Tests with options:
  - EMBEDDING_SDK_VERSION      : ${userOptions.EMBEDDING_SDK_VERSION}
  - SAMPLE_APP_BRANCH_NAME     : ${userOptions.SAMPLE_APP_BRANCH_NAME}
`);

export async function startSampleAppContainers(
  testSuite: SampleAppTestSuiteName,
) {
  const embeddingSdkVersion =
    userOptions.EMBEDDING_SDK_VERSION as EmbeddingSdkVersion;
  const setupConfig = SAMPLE_APP_SETUP_CONFIGS[testSuite];

  const {
    appName,
    defaultBranch,
    "docker-up-command": dockerUpCommand,
    "docker-down-command": dockerDownCommand,
    "docker-env-example-path": dockerEnvExamplePath,
    "docker-env-path": dockerEnvPath,
    env,
  } = setupConfig;
  const branch = userOptions.SAMPLE_APP_BRANCH_NAME || defaultBranch;

  try {
    const { rootPath } = fetchApp({
      appName,
      branch,
    });

    copyExampleEnvFile({ rootPath, dockerEnvExamplePath, dockerEnvPath });

    copyLocalMetabaseJar(rootPath);

    if (embeddingSdkVersion === "local") {
      copyLocalEmbeddingSdkPackage(rootPath);
    }

    await startContainers({
      cwd: rootPath,
      env,
      dockerUpCommand,
      dockerDownCommand,
    });

    printBold(`All done! The ${appName} sample app is now running.`);
  } catch (err) {
    console.log("Error:", err);
    process.exit(FAILURE_EXIT_CODE);
  }
}
