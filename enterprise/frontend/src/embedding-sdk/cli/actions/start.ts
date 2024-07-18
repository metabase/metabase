import { confirm } from "@inquirer/prompts";

import {
  checkIsDockerRunning,
  startLocalMetabaseContainer,
} from "../utils/docker";
import { showGettingStartedGuide } from "../utils/getting-started";
import { checkInReactProject } from "../utils/is-in-react-project";
import { printError } from "../utils/print";

const START_MESSAGE = `
  This command will help you bootstrap a local Metabase instance and embed
  analytics into your React app using the Metabase Embedding SDK.
`;

const DOCKER_NOT_RUNNING_MESSAGE = `
  Docker is not running. Please install and start the Docker daemon before running this command.
  For more information, see https://docs.docker.com/engine/install
`;

export async function start() {
  try {
    console.log(START_MESSAGE);

    const isInReactProject = await checkInReactProject();

    if (!isInReactProject) {
      return;
    }

    const shouldStart = await confirm({ message: "Continue?" });

    if (!shouldStart) {
      printError("Aborted.");
      return;
    }

    const isDockerRunning = await checkIsDockerRunning();

    if (!isDockerRunning) {
      printError(DOCKER_NOT_RUNNING_MESSAGE);
      return;
    }

    const port = await startLocalMetabaseContainer();
    if (!port) {
      return;
    }

    await showGettingStartedGuide(port);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("force closed the prompt")) {
        printError("Aborted.");
        return;
      }
    }

    printError("An error occurred.");
    console.log(error);
  }
}
