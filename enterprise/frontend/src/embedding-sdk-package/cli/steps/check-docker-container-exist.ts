import { exec } from "child_process";
import { promisify } from "util";

import toggle from "inquirer-toggle";

import { CONTAINER_NAME } from "../constants/config";
import { INSTANCE_CONFIGURED_MESSAGE } from "../constants/messages";
import type { CliStepMethod } from "../types/cli";
import { OUTPUT_STYLES, printEmptyLines } from "../utils/print";

const execAsync = promisify(exec);

/**
 * Check if the Docker daemon is running.
 */
export const checkIfDockerContainerExists: CliStepMethod = async (state) => {
  const doesContainerExist = await doesDockerContainerExist(CONTAINER_NAME);

  if (doesContainerExist) {
    printEmptyLines();

    console.log(
      "  The instance is already configured. Delete the container and start over?",
    );

    const shouldRestartSetup = await toggle({
      message: `${OUTPUT_STYLES.error("WARNING: This will delete all data.")}`,
      default: false,
    });

    if (!shouldRestartSetup) {
      return [{ type: "error", message: INSTANCE_CONFIGURED_MESSAGE }, state];
    }

    await exec(`docker rm -f ${CONTAINER_NAME}`);
  }

  return [{ type: "success" }, state];
};

async function doesDockerContainerExist(
  containerName: string,
): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `docker container ls -a --filter name=^/${containerName}$ --format "{{.Names}}"`,
    );

    // If container exists, stdout will contain the container name
    return stdout.trim().length > 0;
  } catch (error) {
    // If docker command fails, assume container doesn't exist
    return false;
  }
}
