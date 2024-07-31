import ora from "ora";

import { installSdk } from "embedding-sdk/cli/steps/install-sdk";
import { getPackageVersion } from "embedding-sdk/cli/utils/get-package-version";

import type { CliStepMethod } from "../types/types";

export const checkSdkAvailable: CliStepMethod = async state => {
  const spinner = ora("Checking if SDK is installed…").start();
  const sdkDep = await getPackageVersion("@metabase/embedding-sdk-react");

  // skip install step if we already have the SDK installed
  if (sdkDep) {
    spinner.succeed(`SDK v${sdkDep} found`);
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
