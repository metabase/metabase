import ora from "ora";
import semver from "semver";

import {
  MISSING_REACT_DEPENDENCY,
  PACKAGE_JSON_NOT_FOUND_MESSAGE,
  UNSUPPORTED_REACT_VERSION,
} from "embedding-sdk/cli/constants/messages";

import type { CliStepMethod } from "../types/cli";
import {
  getPackageVersions,
  hasPackageJson,
} from "../utils/get-package-version";

const isReactVersionSupported = (version: string) =>
  semver.satisfies(semver.coerce(version)!, "18.x || 19.x");

export const checkIfReactProject: CliStepMethod = async (state) => {
  const spinner = ora("Checking if this is a React project…").start();

  if (!(await hasPackageJson())) {
    spinner.fail();
    return [{ type: "error", message: PACKAGE_JSON_NOT_FOUND_MESSAGE }, state];
  }

  const dependencyVersions = await getPackageVersions("react", "react-dom");

  const reactDep = dependencyVersions["react"];
  const reactDomDep = dependencyVersions["react-dom"];

  const hasReactDependency = reactDep && reactDomDep;

  const hasSupportedReactVersion =
    hasReactDependency &&
    isReactVersionSupported(reactDep) &&
    isReactVersionSupported(reactDomDep);

  let errorMessage: string | null = null;

  if (!hasReactDependency) {
    errorMessage = MISSING_REACT_DEPENDENCY;
  } else if (!hasSupportedReactVersion) {
    errorMessage = UNSUPPORTED_REACT_VERSION;
  }

  if (errorMessage) {
    spinner.fail();

    return [
      {
        type: "error",
        message: errorMessage,
      },
      state,
    ];
  } else {
    spinner.succeed(`React ${reactDep} and React DOM ${reactDomDep} found`);
  }

  return [{ type: "success" }, state];
};
