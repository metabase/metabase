import { FAILURE_EXIT_CODE } from "../../constants/exit-code";
import { printBold } from "../../cypress-runner-utils";
import {
  copyLocalEmbeddingSdkPackage,
  copyLocalMetabaseJar,
} from "../shared/helpers/prepare-app";
import { setupAppCleanup } from "../shared/helpers/setup-app-cleanup";
import { startContainers } from "../shared/helpers/start-containers";

import { HOST_APP_FOLDER_PATH } from "./constants/host-app-folder-path";
import { HOST_APP_SETUP_CONFIGS } from "./constants/host-app-setup-configs";
import type { HostAppTestSuiteName } from "./types";

export async function startHostAppContainers(testSuite: HostAppTestSuiteName) {
  const setupConfig = HOST_APP_SETUP_CONFIGS[testSuite];

  const {
    appName,
    "docker-up-command": dockerUpCommand,
    "docker-down-command": dockerDownCommand,
    env,
  } = setupConfig;

  try {
    const rootPath = `${HOST_APP_FOLDER_PATH}/${appName}`;

    setupAppCleanup({ rootPath, env, dockerDownCommand, removeAppDir: false });

    copyLocalMetabaseJar(rootPath);

    copyLocalEmbeddingSdkPackage(rootPath);

    await startContainers({
      cwd: rootPath,
      env,
      dockerUpCommand,
      dockerDownCommand,
    });

    printBold(`All done! The ${appName} Host app is now running.`);
  } catch (err) {
    console.log("Error:", err);
    process.exit(FAILURE_EXIT_CODE);
  }
}
