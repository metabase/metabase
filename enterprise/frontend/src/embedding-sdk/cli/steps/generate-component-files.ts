import fs from "fs/promises";

import { input } from "@inquirer/prompts";

import { getReactComponentGeneratedMessage } from "embedding-sdk/cli/constants/messages";

import { ANALYTICS_CSS_SNIPPET } from "../snippets/analytics-css-snippet";
import type { CliStepMethod } from "../types/cli";
import { getComponentSnippets } from "../utils/get-component-snippets";
import { printError, printSuccess } from "../utils/print";

export const generateReactComponentFiles: CliStepMethod = async state => {
  const {
    instanceUrl,
    apiKey,
    dashboards = [],
    tenancyIsolationEnabled = false,
  } = state;

  if (!instanceUrl || !apiKey) {
    return [
      { type: "error", message: "Missing instance URL or API key." },
      state,
    ];
  }

  let path: string;

  // eslint-disable-next-line no-constant-condition -- ask until user provides a valid path
  while (true) {
    path = await input({
      message: "Where do you want to save the example React components?",
      default: "./components/metabase",
    });

    // Create a directory if it doesn't already exist.
    try {
      await fs.mkdir(path, { recursive: true });
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
    tenancyIsolationEnabled,
  });

  // Generate sample components files in the specified directory.
  for (const { name, content } of sampleComponents) {
    await fs.writeFile(`${path}/${name}.jsx`, content);
  }

  // Generate analytics.css sample styles.
  await fs.writeFile(`${path}/analytics.css`, ANALYTICS_CSS_SNIPPET);

  // Generate index.js file with all the component exports.
  const exportIndexContent = sampleComponents
    .map(file => `export * from "./${file.name}";`)
    .join("\n")
    .trim();

  await fs.writeFile(`${path}/index.js`, exportIndexContent);

  printSuccess(getReactComponentGeneratedMessage(path));

  return [{ type: "done" }, state];
};
