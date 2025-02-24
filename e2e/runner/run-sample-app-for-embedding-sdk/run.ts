import { FAILURE_EXIT_CODE } from "../constants/exit-code";
import { booleanify, printBold, unBooleanify } from "../cypress-runner-utils";
import { SAMPLE_APP_SETUP_CONFIGS } from "../sample-apps-shared/constants/sample-app-setup-configs";
import { copyResourcesToLocalDist } from "../sample-apps-shared/helpers/copy-resources-to-local-dist";
import { fetchApp } from "../sample-apps-shared/helpers/fetch-app";
import { startAppInBackground } from "../sample-apps-shared/helpers/start-app-in-background";
import type {
  EmbeddingSdkVersion,
  SampleAppName,
  SampleAppSetupConfig,
} from "../sample-apps-shared/types";

const userOptions = {
  EMBEDDING_SDK_VERSION: "",
  ...booleanify(process.env),
};

process.env = unBooleanify(userOptions);

printBold(`Running Cypress Sample Apps Tests with options:
  - EMBEDDING_SDK_VERSION      : ${userOptions.EMBEDDING_SDK_VERSION}
`);

async function initSampleApp({
  appName,
  setupConfig,
  embeddingSdkVersion,
}: {
  appName: SampleAppName;
  setupConfig: SampleAppSetupConfig;
  embeddingSdkVersion: EmbeddingSdkVersion;
}) {
  const { branch, "docker-compose-path": dockerComposePath, env } = setupConfig;
  const loggerPrefix = appName;

  const { rootPath } = await fetchApp({
    appName,
    loggerPrefix,
    branch,
  });

  copyResourcesToLocalDist({ rootPath, embeddingSdkVersion, loggerPrefix });

  await startAppInBackground({
    cwd: rootPath,
    dockerComposePath,
    env,
    loggerPrefix,
  });
}

export async function run(appName: SampleAppName) {
  const embeddingSdkVersion = userOptions.EMBEDDING_SDK_VERSION;

  const setupConfig = SAMPLE_APP_SETUP_CONFIGS[appName];

  try {
    await initSampleApp({
      appName,
      setupConfig,
      embeddingSdkVersion,
    });
  } catch (err) {
    console.log("Error:", err);
    process.exit(FAILURE_EXIT_CODE);
  }

  printBold(`All done! The ${appName} sample app is now running.`);
}
