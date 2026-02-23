import fs from "fs/promises";

import { input } from "@inquirer/prompts";

import { getGeneratedComponentFilesMessage } from "../constants/messages";
import { ANALYTICS_CSS_SNIPPET } from "../snippets/analytics-css-snippet";
import { getComponentSnippets } from "../snippets/get-component-snippets";
import type { CliStepMethod } from "../types/cli";
import { checkIsInTypeScriptProject } from "../utils/check-typescript-project";
import {
  checkIfNextJsCustomAppOrRootLayoutExists,
  checkIfNextJsProjectUsesSrcDirectory,
  checkIsInNextJsProject,
  generateNextJsDemoFiles,
} from "../utils/nextjs-helpers";
import { printError, printSuccess } from "../utils/print";
import { getGeneratedComponentsDefaultPath } from "../utils/snippets-helpers";

export const generateReactComponentFiles: CliStepMethod = async (state) => {
  const { instanceUrl, apiKey, dashboards = [], token } = state;

  if (!instanceUrl || !apiKey) {
    return [
      { type: "error", message: "Missing instance URL or API key." },
      state,
    ];
  }

  const isNextJs = await checkIsInNextJsProject();
  const isUsingSrcDirectory = checkIfNextJsProjectUsesSrcDirectory();

  const defaultComponentPath = getGeneratedComponentsDefaultPath({
    isNextJs,
    isUsingSrcDirectory,
  });

  let reactComponentPath: string;

  while (true) {
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

    // Enable user switching only when a valid license is present
    // as JWT requires a valid license, and does not use a sample database.
    userSwitcherEnabled: !!token && !state.useSampleDatabase,
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
    .map((file) => `export * from "./${file.fileName}"`)
    .join("\n")
    .trim();

  await fs.writeFile(
    `${reactComponentPath}/index.${fileExtension}`,
    exportIndexContent,
  );

  const hasNextJsCustomAppOrRootLayout =
    await checkIfNextJsCustomAppOrRootLayoutExists();

  await generateNextJsDemoFiles({
    hasNextJsCustomAppOrRootLayout,
    reactComponentPath,
    componentExtension,
  });

  printSuccess(getGeneratedComponentFilesMessage(reactComponentPath));

  return [
    { type: "done" },
    {
      ...state,
      reactComponentPath,
      hasNextJsCustomAppOrRootLayout,
    },
  ];
};
