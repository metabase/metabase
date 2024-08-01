import { exec as execCallback } from "child_process";

import { detect } from "detect-package-manager";
import toggle from "inquirer-toggle";
import ora from "ora";
import { promisify } from "util";

import type { CliStepMethod } from "embedding-sdk/cli/types/cli";
import {
  printEmptyLines,
  printInfo,
  printSuccess,
} from "embedding-sdk/cli/utils/print";

export const getInstallCommand = async (packageName: string) => {
  const manager = await detect();

  // Construct the command to install the package
  let installCmd;
  switch (manager) {
    case "npm":
      installCmd = `npm install ${packageName}`;
      break;
    case "yarn":
      installCmd = `yarn add ${packageName}`;
      break;
    case "pnpm":
      installCmd = `pnpm add ${packageName}`;
      break;
    case "bun":
      installCmd = `bun add ${packageName}`;
      break;
    default:
      throw new Error(`Unsupported package manager: ${manager}`);
  }

  return installCmd;
};

export async function installPackage(packageName: string) {
  let spinner;
  try {
    const command = await getInstallCommand(packageName);

    spinner = ora(
      `Installing @metabase/embedding-sdk-react with \`${command}…\``,
    ).start();
    const exec = promisify(execCallback);
    // Execute the command
    await exec(command);
    spinner.succeed(`Successfully installed ${packageName}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : error;
    if (spinner) {
      spinner.fail(`Failed to install package: ${errorMessage}`);
    } else {
      console.error(`Failed to install package: ${errorMessage}`);
    }
  }
}

export const installSdk: CliStepMethod = async state => {
  const shouldStart = await toggle({
    message: "Would you like to install the SDK now?",
    default: true,
  });

  if (shouldStart) {
    printEmptyLines();
    await installPackage("@metabase/embedding-sdk-react");
    printEmptyLines();
    return [
      {
        type: "success",
      },
      state,
    ];
  } else {
    const command = await getInstallCommand("@metabase/embedding-sdk-react");
    printEmptyLines();
    printInfo("You can install the SDK later by running:");
    printSuccess(command);
    return [
      {
        type: "error",
        message: "SDK not installed",
      },
      state,
    ];
  }
};
