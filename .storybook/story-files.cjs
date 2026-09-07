const { readFileSync } = require("node:fs");

const MAIN_APP_STORY_GLOBS = [
  "frontend/*/!(embedding-sdk-bundle|embedding-sdk-shared)/**/*.stories.@(ts|tsx)",
  "enterprise/frontend/*/!(embedding-sdk-ee|embedding-sdk-package)/**/*.stories.@(ts|tsx)",
];

function getStories({ pathsFile, filter } = {}) {
  if (pathsFile) {
    const files = JSON.parse(readFileSync(pathsFile, "utf8"));
    if (
      !Array.isArray(files) ||
      !files.every((file) => typeof file === "string")
    ) {
      throw new Error("Story paths must be a JSON array of strings");
    }
    return files.map((file) => `../${file}`);
  }

  const files = filter
    ? filter.split(",")
    : ["frontend/**/*.mdx", ...MAIN_APP_STORY_GLOBS];
  return files.map((file) => `../${file}`);
}

module.exports = { MAIN_APP_STORY_GLOBS, getStories };
