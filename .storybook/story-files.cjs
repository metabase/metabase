const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");

const MAIN_APP_STORY_GLOBS = [
  "frontend/*/!(embedding-sdk-bundle|embedding-sdk-shared)/**/*.stories.@(ts|tsx)",
  "enterprise/frontend/*/!(embedding-sdk-ee|embedding-sdk-package)/**/*.stories.@(ts|tsx)",
];

// Storybook autotitles a story from its path relative to the entry's directory,
// so an untitled story gets a different title in a narrowed build and Loki writes a fresh reference for it.
function hasExplicitTitle(source) {
  // Only load the parser when validating a build; the planner also imports this
  // module for its story globs.
  const { loadCsf } = require("storybook/internal/csf-tools");
  try {
    const { meta } = loadCsf(source, { makeTitle: (title) => title }).parse();
    return typeof meta?.title === "string" && meta.title.length > 0;
  } catch {
    return false;
  }
}

function getStories({ pathsFile, filter } = {}) {
  if (pathsFile) {
    const files = JSON.parse(readFileSync(pathsFile, "utf8"));
    if (
      !Array.isArray(files) ||
      !files.every((file) => typeof file === "string")
    ) {
      throw new Error("Story paths must be a JSON array of strings");
    }
    if (files.length === 0) {
      throw new Error("No stories selected");
    }
    const untitled = files.filter(
      (file) => !hasExplicitTitle(readFileSync(resolve(ROOT, file), "utf8")),
    );
    if (untitled.length > 0) {
      throw new Error(
        `Stories without an explicit title: ${untitled.join(", ")}`,
      );
    }
    return files.map((file) => `../${file}`);
  }

  const files = filter
    ? filter.split(",")
    : ["frontend/**/*.mdx", ...MAIN_APP_STORY_GLOBS];
  return files.map((file) => `../${file}`);
}

module.exports = { MAIN_APP_STORY_GLOBS, getStories, hasExplicitTitle };
