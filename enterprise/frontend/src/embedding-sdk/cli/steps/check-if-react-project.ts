import ora from "ora";
import semver from "semver";

import {
  MISSING_REACT_DEPENDENCY,
  PACKAGE_JSON_NOT_FOUND_MESSAGE,
  UNSUPPORTED_REACT_VERSION,
} from "embedding-sdk/cli/constants/messages";

import type { CliStepMethod } from "../types/cli";
import {
  getDependenciesFromPackageJson,
  hasPackageJson,
} from "../utils/get-package-version";
import { showWarningAndAskToContinue } from "../utils/show-warning-prompt";

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

  const projectDependencies = await getDependenciesFromPackageJson();

  const reactDep = projectDependencies?.["react"];
  const reactDomDep = projectDependencies?.["react-dom"];

  const hasReactDependency = reactDep && reactDomDep;

  const hasSupportedReactVersion =
    hasReactDependency &&
    isReactVersionSupported(reactDep) &&
    isReactVersionSupported(reactDomDep);

  let warningMessage: string | null = null;

  if (!hasReactDependency) {
    warningMessage = MISSING_REACT_DEPENDENCY;
  } else if (!hasSupportedReactVersion) {
    warningMessage = UNSUPPORTED_REACT_VERSION;
  }

  if (warningMessage) {
    spinner.fail();

    const shouldContinue = await showWarningAndAskToContinue(warningMessage);

    if (!shouldContinue) {
      return [{ type: "error", message: "Canceled." }, state];
    }
  } else {
    spinner.succeed(`React v${reactDep} and React DOM v${reactDomDep} found`);
  }

  return [{ type: "success" }, state];
};
