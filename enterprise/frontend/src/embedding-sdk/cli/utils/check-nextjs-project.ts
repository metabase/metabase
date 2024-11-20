import fs from "fs";

import path from "path";

import { getProjectDependenciesFromPackageJson } from "../utils/get-package-version";

const hasFileInProject = (fileName: string) =>
  fs.existsSync(path.join(process.cwd(), fileName));

/**
 * Checks if the current project is a Next.js project.
 *
 * It determines this by checking if the `tsconfig.json` file exists, or
 * if the `package.json` file contains a `typescript` dev dependency.
 */
export async function checkIsInNextJsProject() {
  const dependencies = await getProjectDependenciesFromPackageJson();

  const hasNextJsDependency = !!dependencies?.next;

  const hasNextJsConfig =
    hasFileInProject("next.config.js") || hasFileInProject("next.config.ts");

  return hasNextJsDependency || hasNextJsConfig;
}
