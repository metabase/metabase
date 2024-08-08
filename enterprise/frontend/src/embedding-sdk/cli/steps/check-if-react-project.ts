import ora from "ora";
import semver from "semver";

import {
  MISSING_REACT_DEPENDENCY,
  PACKAGE_JSON_NOT_FOUND_MESSAGE,
  UNSUPPORTED_REACT_VERSION,
} from "embedding-sdk/cli/constants/messages";
import {
  getPackageVersion,
  hasPackageJson,
} from "embedding-sdk/cli/utils/get-package-version";

import type { CliStepMethod } from "../types/cli";

const isReactVersionSupported = (version: string) =>
  semver.satisfies(semver.coerce(version)!, "18.x");

export const checkIfReactProject: CliStepMethod = async state => {
  const spinner = ora("Checking if this is a React project…").start();

  if (!(await hasPackageJson())) {
    spinner.fail();
    return [
      {
        type: "error",
        message: PACKAGE_JSON_NOT_FOUND_MESSAGE,
      },
      state,
    ];
  }

  const reactDep = await getPackageVersion("react");
  const reactDomDep = await getPackageVersion("react-dom");

  const hasReactDependency = reactDep && reactDomDep;
  const hasSupportedReactVersion =
    isReactVersionSupported(reactDep) && isReactVersionSupported(reactDomDep);

  if (!hasReactDependency) {
    spinner.fail();
    return [
      {
        type: "error",
        message: MISSING_REACT_DEPENDENCY,
      },
      state,
    ];
  }

  if (!hasSupportedReactVersion) {
    spinner.fail();
    return [
      {
        type: "error",
        message: UNSUPPORTED_REACT_VERSION,
      },
      state,
    ];
  }

  spinner.succeed(`React v${reactDep} and React DOM v${reactDomDep} found`);
  return [
    {
      type: "success",
    },
    state,
  ];
};
