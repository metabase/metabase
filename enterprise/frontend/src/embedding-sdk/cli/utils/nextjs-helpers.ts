import fs from "fs";

import { glob } from "glob";
import path from "path";

import { NEXTJS_DEMO_ROUTE_NAME } from "../constants/config";
import {
  getNextJsAnalyticsPageSnippet,
  getNextJsPagesWrapperOrAppWrapperSnippet,
} from "../snippets/nextjs-snippets";

import { checkIsInTypeScriptProject } from "./check-typescript-project";
import { getProjectDependenciesFromPackageJson } from "./get-package-version";

/** Next.js optionally supports storing all sources under the `src` directory */
export const SRC_DIR_NAME = "src";

const hasPath = (pattern: string) => {
  try {
    return glob.sync(pattern).length > 0;
  } catch (error) {
    return false;
  }
};

/**
 * Checks if the current project is a Next.js project.
 *
 * It determines this by checking if the `tsconfig.json` file exists, or
 * if the `package.json` file contains a `typescript` dev dependency.
 */
export async function checkIsInNextJsProject() {
  const dependencies = await getProjectDependenciesFromPackageJson();

  const hasNextJsDependency = !!dependencies?.next;

  const hasNextJsConfig = hasPath("next.config.*");

  return hasNextJsDependency || hasNextJsConfig;
}

/**
 * Check if the current project is using the app or page router.
 * Prioritizes the app router (more modern) if both are present.
 */
export async function checkIfUsingAppOrPagesRouter() {
  const sourcePrefix = getNextJsSourceDirectoryPrefix();

  if (hasPath(sourcePrefix + "app")) {
    return "app";
  }

  if (hasPath(sourcePrefix + "pages")) {
    return "pages";
  }

  return null;
}

/**
 * Next.js 15's CLI introduced the option to store all sources under the `src` directory.
 * This checks if the current project is using the `src` directory.
 */
export const checkIfNextJsProjectUsesSrcDirectory = () => hasPath(SRC_DIR_NAME);

export const getNextJsSourceDirectoryPrefix = () =>
  checkIfNextJsProjectUsesSrcDirectory() ? `${SRC_DIR_NAME}/` : "";

/**
 * Checks if the current Next.js project has a custom root layout (app router)
 * or custom app (pages router).
 *
 * @see https://nextjs.org/docs/pages/building-your-application/routing/custom-app
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/layout#root-layouts
 */
export async function checkIfNextJsCustomAppOrRootLayoutExists() {
  const router = await checkIfUsingAppOrPagesRouter();
  const sourcePrefix = getNextJsSourceDirectoryPrefix();

  // App router uses the `app/layout` root layout file.
  if (router === "app") {
    return hasPath(sourcePrefix + "app/layout.*");
  }

  // Pages router uses the `pages/_app` file.
  if (router === "pages") {
    return hasPath(sourcePrefix + "pages/_app.*");
  }

  return false;
}

/**
 * Adds the 'use client' directive to the source code if the project is a Next.js project.
 */
export const withNextJsUseClientDirective = (
  source: string,
  isNextJs: boolean,
) => (isNextJs ? `'use client'\n${source}` : source);

/** Strips the `src/` prefix from import paths. */
export const stripSrcPrefixFromPath = (path: string) =>
  path.replace(`${SRC_DIR_NAME}/`, "");

/** Resolves the import path from root layout (or custom app) to components */
export const getImportPathForRootLayout = (
  componentPath: string,
  pathName: string,
) => path.normalize(`../${stripSrcPrefixFromPath(componentPath)}/${pathName}`);

async function generateNextJsCustomAppOrRootLayoutFile(componentPath: string) {
  const router = await checkIfUsingAppOrPagesRouter();
  const isInTypeScriptProject = await checkIsInTypeScriptProject();
  const extension = isInTypeScriptProject ? "tsx" : "js";
  const sourcePrefix = getNextJsSourceDirectoryPrefix();

  const snippet = getNextJsPagesWrapperOrAppWrapperSnippet({
    router,
    resolveImport: (pathName) =>
      getImportPathForRootLayout(componentPath, pathName),
  });

  if (router === "pages") {
    fs.writeFileSync(sourcePrefix + `pages/_app.${extension}`, snippet);
  }

  if (router === "app") {
    fs.writeFileSync(sourcePrefix + `app/layout.${extension}`, snippet);
  }
}

export async function generateNextJsDemoFiles({
  hasNextJsCustomAppOrRootLayout,
  reactComponentPath,
  componentExtension: extension,
}: {
  hasNextJsCustomAppOrRootLayout: boolean;
  reactComponentPath: string;
  componentExtension: string;
}) {
  const isNextJs = await checkIsInNextJsProject();
  const router = await checkIfUsingAppOrPagesRouter();
  const sourcePrefix = getNextJsSourceDirectoryPrefix();

  if (!isNextJs) {
    return;
  }

  // Generates a custom app.tsx or layout.tsx file if they do not exist yet.
  if (!hasNextJsCustomAppOrRootLayout) {
    await generateNextJsCustomAppOrRootLayoutFile(reactComponentPath);
  }

  const snippet = getNextJsAnalyticsPageSnippet({
    resolveImport(pathName: string) {
      const basePath = `${stripSrcPrefixFromPath(reactComponentPath)}/${pathName}`;

      // Import path is two levels up from the app router's page directory.
      if (router === "app") {
        return path.normalize(`../../${basePath}`);
      }

      // Import path is one level up from the pages router's page file.
      return path.normalize(`../${basePath}`);
    },
  });

  if (router === "app") {
    const routeDir = `${sourcePrefix}app/${NEXTJS_DEMO_ROUTE_NAME}`;

    fs.mkdirSync(routeDir, { recursive: true });
    fs.writeFileSync(`${routeDir}/page.${extension}`, snippet);
  }

  if (router === "pages") {
    fs.writeFileSync(
      `${sourcePrefix}pages/${NEXTJS_DEMO_ROUTE_NAME}.${extension}`,
      snippet,
    );
  }
}
