import fs from "fs";

import path from "path";

import { getNextJsCustomAppOrRootLayoutSnippet } from "../snippets/nextjs-app-snippets";
import { getNextJsAnalyticsPageSnippet } from "../snippets/nextjs-page-snippet";

import { checkIsInTypeScriptProject } from "./check-typescript-project";
import { getProjectDependenciesFromPackageJson } from "./get-package-version";

const hasPathInProject = (fileName: string) =>
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
    hasPathInProject("next.config.js") || hasPathInProject("next.config.ts");

  return hasNextJsDependency || hasNextJsConfig;
}

/**
 * Check if the current project is using the app or page router.
 * Prioritizes the app router (more modern) if both are present.
 */
export async function checkIfUsingAppOrPagesRouter() {
  if (hasPathInProject("app")) {
    return "app";
  }

  if (hasPathInProject("pages")) {
    return "pages";
  }

  return null;
}

/**
 * Checks if the current Next.js project has a custom root layout (app router)
 * or custom app (pages router).
 *
 * @see https://nextjs.org/docs/pages/building-your-application/routing/custom-app
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/layout#root-layouts
 */
export async function checkIfNextJsCustomAppOrRootLayoutExists() {
  const router = await checkIfUsingAppOrPagesRouter();

  // App router uses the `app/layout` root layout file.
  if (router === "app") {
    return (
      hasPathInProject("app/layout.js") || hasPathInProject("app/layout.tsx")
    );
  }

  // Pages router uses the `pages/_app` file.
  if (router === "pages") {
    return (
      hasPathInProject("pages/_app.js") || hasPathInProject("pages/_app.tsx")
    );
  }

  return false;
}

/**
 * Adds the 'use client' directive to the source code if the project is a Next.js project.
 */
export const withNextJsDirective = (source: string, isNextJs: boolean) =>
  isNextJs ? `'use client'\n${source}` : source;

export async function generateNextJsCustomAppOrRootLayoutFile(
  componentPath: string,
) {
  const router = await checkIfUsingAppOrPagesRouter();
  const isInTypeScriptProject = await checkIsInTypeScriptProject();
  const extension = isInTypeScriptProject ? "tsx" : "js";

  const snippet = await getNextJsCustomAppOrRootLayoutSnippet(componentPath);

  if (router === "pages") {
    fs.writeFileSync(`./pages/_app.${extension}`, snippet);
  }

  if (router === "app") {
    fs.writeFileSync(`./app/layout.${extension}`, snippet);
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

  if (!isNextJs) {
    return;
  }

  // Generates a custom app.tsx or layout.tsx file if they do not exist yet.
  if (!hasNextJsCustomAppOrRootLayout) {
    await generateNextJsCustomAppOrRootLayoutFile(reactComponentPath);
  }

  const snippet = await getNextJsAnalyticsPageSnippet(reactComponentPath);

  if (router === "app") {
    fs.mkdirSync("./app/analytics-demo", { recursive: true });
    fs.writeFileSync(`./app/analytics-demo/page.${extension}`, snippet);
  }

  if (router === "pages") {
    fs.writeFileSync(`./pages/analytics-demo.${extension}`, snippet);
  }
}
