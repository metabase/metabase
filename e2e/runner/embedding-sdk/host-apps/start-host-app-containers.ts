import { FAILURE_EXIT_CODE } from "../../constants/exit-code";
import { printBold } from "../../cypress-runner-utils";
import { setupAppCleanup } from "../shared/helpers/setup-app-cleanup";

import { HOST_APP_FOLDER_PATH } from "./constants/host-app-folder-path";
import { HOST_APP_SETUP_CONFIGS } from "./constants/host-app-setup-configs";
import { startApp } from "./helpers/start-app";
import type { HostAppTestSuiteName } from "./types";

export async function startHostAppContainers(testSuite: HostAppTestSuiteName) {
  const setupConfig = HOST_APP_SETUP_CONFIGS[testSuite];

  const {
    appName,
    "app-run-command": appRunCommand,
    "app-down-command": appDownCommand,
    env,
  } = setupConfig;

  try {
    const rootPath = `${HOST_APP_FOLDER_PATH}/${appName}`;

    setupAppCleanup({ rootPath, env, appDownCommand, cleanupAppDir: false });

    await startApp({ appRunCommand, appDownCommand, cwd: rootPath, env });

    printBold(`All done! The ${appName} Host app is now running.`);
  } catch (err) {
    console.log("Error:", err);
    process.exit(FAILURE_EXIT_CODE);
  }
}
