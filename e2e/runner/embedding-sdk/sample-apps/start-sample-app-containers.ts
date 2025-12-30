import { FAILURE_EXIT_CODE } from "../../constants/exit-code";
import { printBold } from "../../cypress-runner-utils";
import { setupAppCleanup } from "../shared/helpers/setup-app-cleanup";

import { SAMPLE_APP_SETUP_CONFIGS } from "./constants/sample-app-setup-configs";
import { copyShoppyMetabaseAppDBDump } from "./helpers/copy-shoppy-metabase-app-db-dump";
import { fetchApp } from "./helpers/fetch-app";
import {
  copyExampleEnvFile,
  copyLocalEmbeddingSdkPackage,
  copyLocalMetabaseJar,
} from "./helpers/prepare-app";
import { startContainers } from "./helpers/start-containers";
import type { EmbeddingSdkVersion, SampleAppTestSuiteName } from "./types";

const userOptions = {
  EMBEDDING_SDK_VERSION: "local",
  SAMPLE_APP_BRANCH_NAME: "",
  ...process.env,
} as const;

printBold(`Setting up the Sample App environment with options:
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
    healthcheckPorts,
  } = setupConfig;
  const branch = userOptions.SAMPLE_APP_BRANCH_NAME || defaultBranch;

  try {
    const { rootPath } = fetchApp({
      appName,
      branch,
    });

    setupAppCleanup({
      rootPath,
      env,
      appDownCommand: dockerDownCommand,
      cleanupAppDir: true,
    });

    copyExampleEnvFile({ rootPath, dockerEnvExamplePath, dockerEnvPath });

    copyLocalMetabaseJar(rootPath);

    if (embeddingSdkVersion === "local") {
      copyLocalEmbeddingSdkPackage(rootPath);
    }

    if (testSuite === "shoppy-e2e") {
      copyShoppyMetabaseAppDBDump(rootPath);
    }

    await startContainers({
      cwd: rootPath,
      env,
      appName,
      dockerUpCommand,
      dockerDownCommand,
      healthcheckPorts,
    });

    printBold(`All done! The ${appName} sample app is now running.`);
  } catch (err) {
    console.log("Error:", err);
    process.exit(FAILURE_EXIT_CODE);
  }
}
