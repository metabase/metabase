import fs from "fs";

import path from "path";

import { getProjectDependenciesFromPackageJson } from "./get-package-version";

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

/**
 * Checks if the current Next.js project has a custom `_app.js`, `_app.jsx`, or `_app.tsx` file.
 *
 * @see https://nextjs.org/docs/pages/building-your-application/routing/custom-app
 */
export async function checkIfNextJsCustomAppExists() {
  return (
    hasFileInProject("pages/_app.js") ||
    hasFileInProject("pages/_app.jsx") ||
    hasFileInProject("pages/_app.tsx")
  );
}

/**
 * Adds the 'use client' directive to the source code if the project is a Next.js project.
 */
export const withNextJsDirective = (source: string, isNextJs: boolean) =>
  isNextJs ? `'use client'\n${source}` : source;
