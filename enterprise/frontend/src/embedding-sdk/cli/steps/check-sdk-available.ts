import ora from "ora";

import { SDK_PACKAGE_NAME } from "embedding-sdk/cli/constants/config";
import { installSdk } from "embedding-sdk/cli/steps/install-sdk";
import { getPackageVersion } from "embedding-sdk/cli/utils/get-package-version";

import type { CliStepMethod } from "../types/cli";

export const checkSdkAvailable: CliStepMethod = async state => {
  const spinner = ora("Checking if SDK is installed…").start();
  const sdkVersion = await getPackageVersion(SDK_PACKAGE_NAME);

  // skip install step if we already have the SDK installed
  if (sdkVersion) {
    spinner.succeed(`SDK v${sdkVersion} found`);
    return [
      {
        type: "success",
      },
      state,
    ];
  }

  spinner.fail("SDK not found");

  return installSdk(state);
};
