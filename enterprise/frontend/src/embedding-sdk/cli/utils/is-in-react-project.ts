import fs from "fs/promises";

import semver from "semver";

import { printError } from "./print";

const PACKAGE_JSON_NOT_FOUND_MESSAGE = `
  Could not find a package.json file in the current directory.
  Please run this command from the root of your project.
`;

// TODO: add support for React 17 once compatibility issue is resolved
const isReactVersionSupported = (version: string) =>
  semver.satisfies(semver.coerce(version)!, "18.x");

const MISSING_REACT_DEPENDENCY = `
  Your package.json file does not contain a dependency for React.
  Please make sure your package.json file contains a dependency for React 18.
`;

const UNSUPPORTED_REACT_VERSION = `
  Your package.json file contains an unsupported React version.
  Please make sure your package.json file contains a dependency for React 18.
`;

/**
 * Are we in a React project with a supported React version?
 */
export async function checkInReactProject(): Promise<boolean> {
  const packageJson = await fs.stat("./package.json");

  if (!packageJson.isFile()) {
    printError(PACKAGE_JSON_NOT_FOUND_MESSAGE);
    return false;
  }

  try {
    const packageJson = JSON.parse(await fs.readFile("./package.json", "utf8"));
    const deps = packageJson.dependencies;

    const hasReactDependency = deps.react && deps["react-dom"];

    const hasSupportedReactVersion =
      isReactVersionSupported(deps.react) &&
      isReactVersionSupported(deps["react-dom"]);

    if (!hasReactDependency) {
      printError(MISSING_REACT_DEPENDENCY);
      return false;
    }

    if (!hasSupportedReactVersion) {
      printError(UNSUPPORTED_REACT_VERSION);
      return false;
    }

    return true;
  } catch (error) {
    printError("Could not parse your package.json file.");
    return false;
  }
}
