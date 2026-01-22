#!/usr/bin/env tsx
/* eslint-disable no-console */
import { readFileSync } from "fs";

import { glob } from "glob";

import { ALL_COLOR_NAMES } from "../../frontend/src/metabase/lib/colors";

/**
 * This script finds css variables that are used but *never* defined in our codebase.
 * Its goal isn't to find usages of variables in contexts where that variable is not defined,
 * as that would be a lot harder.
 * Its goal is to prevent typos and wrong usages created by conflicts and backports.
 * The most common thing this should catch and prevent is backporting a fix or feature that uses a css variable
 * that doesn't exist in the release branch.
 */

const shouldWhiteList = (variable: string) => {
  // Use this for whitelisting some variables if we know they're defined by a 3rd party, such as mantine
  // Note: Be sure not to backport changes to this function that would whitelist variables not on the release branch

  if (knownIssues.includes(variable)) {
    return true;
  }

  return false;
};

// These are variables that were found by the script but were temporarily allowed to get this script + mantine v7 merged
const knownIssues = [
  "--mb-bolor-text-error",
  "--mb-bolor-text-medium",
  "--mb-color-accent-3",
  "--mb-spacing-xs",
  "--mb-text-text-dark",
  "--multiselect-pill-font-size",
  "--select-item-font-size",
  "--select-item-line-height",
  "--button-bg", // Mantine var defined for buttons and used in Button.module.css
];

interface UsageMap {
  // variable : files
  [variable: string]: string[];
}

const findFiles = (): string[] => {
  return glob.sync(
    "{frontend,enterprise/frontend}/**/*.{css,module.css,js,jsx,ts,tsx}",
  );
};

const extractVariableDefinitions = (filePath: string): Set<string> => {
  const fileContent = readFileSync(filePath, "utf8");
  return extractVariableDefinitionsFromFileContent(fileContent);
};

export const extractVariableDefinitionsFromFileContent = (
  fileContent: string,
): Set<string> => {
  const patterns = [
    /--[a-zA-Z0-9-]+:/g, // css files: --my-css-variable: blue
    /['"`]--[a-zA-Z0-9-]+['"`]\s*:/g, // css-in-js: "--my-css-variable-in-emotion": blue
  ];

  const matches = patterns.flatMap(pattern => {
    const found = fileContent.match(pattern) || [];
    return found.map(match => {
      const cleaned = match.replace(/['"`{}:,\s]/g, "");

      return cleaned;
    });
  });

  return new Set(matches);
};

const extractVariableUsages = (filePath: string): Set<string> => {
  const content = readFileSync(filePath, "utf8");
  return extractVariableUsagesFromFileContent(content);
};

export const extractVariableUsagesFromFileContent = (
  content: string,
): Set<string> => {
  const pattern = /var\((--[a-zA-Z0-9-]+)\)/g;
  const matches = Array.from(content.matchAll(pattern)).map(match => match[1]);

  return new Set(matches);
};

const main = () => {
  const files = findFiles();

  const allDefinitions = new Set<string>();
  const allUsages = new Set<string>();
  const usageLocations: UsageMap = {};

  const mantineDefinitions = extractVariableDefinitions(
    "node_modules/@mantine/core/styles.css",
  );

  for (const definition of mantineDefinitions) {
    allDefinitions.add(definition);
  }

  ALL_COLOR_NAMES.forEach((key) => {
    allDefinitions.add(`--mb-color-${key}`);
  });

  // Find all variable definitions
  files.forEach(file => {
    const definitions = extractVariableDefinitions(file);
    definitions.forEach(def => allDefinitions.add(def));
  });

  // Find all variable usages
  files.forEach(file => {
    const usages = extractVariableUsages(file);
    usages.forEach(usage => {
      allUsages.add(usage);
      if (!usageLocations[usage]) {
        usageLocations[usage] = [];
      }
      usageLocations[usage].push(file);
    });
  });

  // Filter out defined or whitelisted variables
  const undefinedVars = Array.from(allUsages)
    .filter(usage => !allDefinitions.has(usage) && !shouldWhiteList(usage))
    .sort();

  if (undefinedVars.length > 0) {
    console.log("Found undefined CSS variables:\n");
    undefinedVars.forEach(variable => {
      console.log(`${variable} used in:`);
      usageLocations[variable].forEach(location => {
        console.log(`  - ${location}`);
      });
      console.log("");
    });

    const filesWithUndefinedVars = new Set(
      undefinedVars.map(variable => usageLocations[variable]).flat(),
    );

    console.log(
      `Found ${undefinedVars.length} CSS variables that were used but never defined in ${filesWithUndefinedVars.size} files\n`,
    );

    console.log(
      "See bin/find-never-defined-css-variables/find-never-defined-css-variables.ts for more details\n",
    );

    process.exit(1);
  } else {
    console.log("No undefined CSS variables found");
    process.exit(0);
  }
};

if (require.main === module) {
  main();
}
