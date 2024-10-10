import ora from "ora";

import { SDK_PACKAGE_NAME } from "../constants/config";
import { installSdk } from "../steps/install-sdk";
import type { CliStepMethod } from "../types/cli";
import { getPackageVersions } from "../utils/get-package-version";

export const checkSdkAvailable: CliStepMethod = async state => {
  const spinner = ora("Checking if SDK is installed…").start();

  const projectDependencies = await getPackageVersions(SDK_PACKAGE_NAME);
  const sdkVersion = projectDependencies?.[SDK_PACKAGE_NAME];

  // skip install step if we already have the SDK installed
  if (sdkVersion) {
    spinner.succeed(`SDK v${sdkVersion} found`);
    return [{ type: "success" }, state];
  }

  spinner.fail("SDK not found");

  return installSdk(state);
};
