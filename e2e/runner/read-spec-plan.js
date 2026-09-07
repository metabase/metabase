const { readFileSync } = require("node:fs");

function readSpecPlan(pathsFile) {
  if (!pathsFile) {
    return null;
  }

  const files = JSON.parse(readFileSync(pathsFile, "utf8"));
  if (
    !Array.isArray(files) ||
    !files.every((file) => typeof file === "string" && file.length > 0)
  ) {
    throw new Error("Spec paths must be a JSON array of non-empty strings");
  }
  return files;
}

module.exports = { readSpecPlan };
