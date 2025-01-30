import { getSampleAppsNamesFromEnv } from "../../support/helpers/e2e-sample-apps-helpers";
import { FAILURE_EXIT_CODE } from "../constants/exit-code";
import { booleanify, printBold, unBooleanify } from "../cypress-runner-utils";
import { applyAppSpecificAdjustments } from "../sample-apps-shared/helpers/apply-app-specific-adjustments";
import { buildApp } from "../sample-apps-shared/helpers/build-app";
import { fetchApp } from "../sample-apps-shared/helpers/fetch-app";
import { getSetupConfigsForSampleApps } from "../sample-apps-shared/helpers/get-setup-configs-for-sample-apps";
import { installDependencies } from "../sample-apps-shared/helpers/install-dependencies";
import { setupEntityIdsInjection } from "../sample-apps-shared/helpers/setup-entity-ids-injection";
import { setupEnvironmentFiles } from "../sample-apps-shared/helpers/setup-environment-files";
import { startAppInBackground } from "../sample-apps-shared/helpers/start-app-in-background";
import type {
  EmbeddingSdkVersion,
  SampleAppName,
  SampleAppSetupConfig,
} from "../sample-apps-shared/types";

import { SAMPLE_APP_NAMES } from "./config";

const userOptions = {
  EMBEDDING_SDK_VERSION: "",
  SAMPLE_APP_NAMES: SAMPLE_APP_NAMES.join(","),
  EXCLUDE_SAMPLE_APP_NAMES: "",
  ...booleanify(process.env),
};

process.env = unBooleanify(userOptions);

printBold(`Running Cypress Sample Apps Tests with options:
  - EMBEDDING_SDK_VERSION      : ${userOptions.EMBEDDING_SDK_VERSION}
  - SAMPLE_APP_NAMES           : ${userOptions.SAMPLE_APP_NAMES}
  - EXCLUDE_SAMPLE_APP_NAMES   : ${userOptions.EXCLUDE_SAMPLE_APP_NAMES}
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
  const { subAppName, branch, framework, env, startCommand, beforeSetup } =
    setupConfig;
  const loggerPrefix = [appName, subAppName].filter(Boolean).join("/");

  beforeSetup?.({ appName, subAppName });

  const { rootPath, installationPath } = await fetchApp({
    appName,
    subAppName,
    loggerPrefix,
    branch,
  });

  setupEnvironmentFiles({
    rootPath,
    installationPath,
    env,
    loggerPrefix,
  });

  setupEntityIdsInjection({ installationPath, loggerPrefix });

  applyAppSpecificAdjustments({ installationPath, framework, loggerPrefix });

  await installDependencies({
    installationPath,
    embeddingSdkVersion,
    loggerPrefix,
  });

  await buildApp({ installationPath, loggerPrefix });

  startAppInBackground({ cwd: installationPath, startCommand, loggerPrefix });
}

export async function run() {
  const embeddingSdkVersion = userOptions.EMBEDDING_SDK_VERSION;
  const sampleAppNames = getSampleAppsNamesFromEnv() as SampleAppName[];

  const sampleAppsPromises = getSetupConfigsForSampleApps(sampleAppNames).map(
    ([appName, setupConfig]) =>
      initSampleApp({ appName, setupConfig, embeddingSdkVersion }),
  );

  try {
    await Promise.all(sampleAppsPromises);
  } catch (err) {
    console.log("Error:", err);
    process.exit(FAILURE_EXIT_CODE);
  }

  printBold("All done! All sample apps are now running.");
}
