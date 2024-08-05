import { exec as execCallback } from "child_process";

import { detect } from "detect-package-manager";
import toggle from "inquirer-toggle";
import ora from "ora";
import { promisify } from "util";

import { SDK_PACKAGE_NAME } from "embedding-sdk/cli/constants/config";
import type { CliStepMethod } from "embedding-sdk/cli/types/cli";
import {
  printEmptyLines,
  printInfo,
  printSuccess,
} from "embedding-sdk/cli/utils/print";

const getInstallCommand = async (packageName: string) => {
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

const installPackage = async (packageName: string) => {
  let spinner;
  try {
    const command = await getInstallCommand(packageName);

    spinner = ora(
      `Installing ${SDK_PACKAGE_NAME} with \`${command}…\``,
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
};

export const installSdk: CliStepMethod = async state => {
  const shouldStart = await toggle({
    message: "Would you like to install the SDK now?",
    default: true,
  });

  if (shouldStart) {
    printEmptyLines();
    await installPackage(SDK_PACKAGE_NAME);
    printEmptyLines();
    return [
      {
        type: "success",
      },
      state,
    ];
  } else {
    const command = await getInstallCommand(SDK_PACKAGE_NAME);
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
