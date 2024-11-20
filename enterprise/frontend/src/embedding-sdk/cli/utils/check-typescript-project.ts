import fs from "fs";

import path from "path";

import { getProjectDependenciesFromPackageJson } from "../utils/get-package-version";

/**
 * Checks if the current project is a TypeScript project.
 *
 * It determines this by checking if the `tsconfig.json` file exists, or
 * if the `package.json` file contains a `typescript` dev dependency.
 */
export async function checkIsInTypeScriptProject() {
  const devDependencies =
    await getProjectDependenciesFromPackageJson("devDependencies");

  const tsconfigPath = path.join(process.cwd(), "tsconfig.json");

  const hasTypeScriptDevDependency = !!devDependencies?.typescript;
  const hasTsConfig = fs.existsSync(tsconfigPath);

  return hasTypeScriptDevDependency || hasTsConfig;
}
