import fs from "fs/promises";

import { input } from "@inquirer/prompts";

import {
  GENERATED_COMPONENTS_DEFAULT_PATH,
  GENERATED_COMPONENTS_DEFAULT_PATH_NEXTJS,
} from "../constants/config";
import { getGeneratedComponentFilesMessage } from "../constants/messages";
import { ANALYTICS_CSS_SNIPPET } from "../snippets/analytics-css-snippet";
import type { CliStepMethod } from "../types/cli";
import { checkIsInTypeScriptProject } from "../utils/check-typescript-project";
import { getComponentSnippets } from "../utils/get-component-snippets";
import {
  checkIfNextJsCustomAppOrRootLayoutExists,
  checkIsInNextJsProject,
  generateNextJsCustomAppOrRootLayoutFile,
} from "../utils/nextjs-helpers";
import { printError, printSuccess } from "../utils/print";

export const generateReactComponentFiles: CliStepMethod = async state => {
  const { instanceUrl, apiKey, dashboards = [], token } = state;

  if (!instanceUrl || !apiKey) {
    return [
      { type: "error", message: "Missing instance URL or API key." },
      state,
    ];
  }

  const isNextJs = await checkIsInNextJsProject();

  let reactComponentPath: string;

  // eslint-disable-next-line no-constant-condition -- ask until user provides a valid path
  while (true) {
    const defaultComponentPath = isNextJs
      ? GENERATED_COMPONENTS_DEFAULT_PATH_NEXTJS
      : GENERATED_COMPONENTS_DEFAULT_PATH;

    reactComponentPath = await input({
      message: "Where do you want to save the example React components?",
      default: defaultComponentPath,
    });

    // Create a directory if it doesn't already exist.
    try {
      await fs.mkdir(reactComponentPath, { recursive: true });
      break;
    } catch (error) {
      printError(
        `The current path is not writeable. Please pick a different path.`,
      );
    }
  }

  const sampleComponents = getComponentSnippets({
    instanceUrl,
    apiKey,
    dashboards,
    isNextJs,

    // Enable user switching only when a valid license is present,
    // as JWT requires a valid license.
    userSwitcherEnabled: !!token,
  });

  const isInTypeScriptProject = await checkIsInTypeScriptProject();
  const fileExtension = isInTypeScriptProject ? "ts" : "js";
  const componentExtension = isInTypeScriptProject ? "tsx" : "jsx";

  // Generate sample components files in the specified directory.
  for (const { fileName, content } of sampleComponents) {
    await fs.writeFile(
      `${reactComponentPath}/${fileName}.${componentExtension}`,
      content,
    );
  }

  // Generate analytics.css sample styles.
  await fs.writeFile(
    `${reactComponentPath}/analytics.css`,
    ANALYTICS_CSS_SNIPPET,
  );

  // Generate index.js file with all the component exports.
  const exportIndexContent = sampleComponents
    .map(file => `export * from "./${file.fileName}"`)
    .join("\n")
    .trim();

  await fs.writeFile(
    `${reactComponentPath}/index.${fileExtension}`,
    exportIndexContent,
  );

  const hasNextJsCustomApp = await checkIfNextJsCustomAppOrRootLayoutExists();

  // Generates a custom app.tsx or layout.tsx file if they do not exist yet.
  if (isNextJs && !hasNextJsCustomApp) {
    await generateNextJsCustomAppOrRootLayoutFile(reactComponentPath);
  }

  printSuccess(getGeneratedComponentFilesMessage(reactComponentPath));

  return [
    { type: "done" },
    {
      ...state,
      reactComponentPath,
      hasNextJsCustomAppOrRootLayout: hasNextJsCustomApp,
    },
  ];
};
