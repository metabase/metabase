import fs from "fs";

import path from "path";

import { getProjectDependenciesFromPackageJson } from "../utils/get-package-version";

/**
 * Checks if the current project is a TypeScript project.
 *
 * It determines this by checking if the `tsconfig.json` file exists, or
 * if the `package.json` file contains a `typescript` dependency.
 */
export async function checkIsInTypeScriptProject() {
  const dependencies =
    await getProjectDependenciesFromPackageJson("dependencies");

  const devDependencies =
    await getProjectDependenciesFromPackageJson("devDependencies");

  const tsconfigPath = path.join(process.cwd(), "tsconfig.json");

  // Most people should have a `typescript` as a dev dependency, but we'll check
  // for it as a dependency too, just in case.
  const hasTypeScriptDependency =
    !!devDependencies?.typescript || !!dependencies?.typescript;

  const hasTsConfig = fs.existsSync(tsconfigPath);

  return hasTypeScriptDependency || hasTsConfig;
}
