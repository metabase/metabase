import path from "path";

import { getGeneratedComponentsDefaultPath } from "./snippets-helpers";

export const getSuggestedImportPath = ({
  isNextJs,
  isUsingSrcDirectory,
  componentPath,
}: {
  isNextJs: boolean;
  isUsingSrcDirectory: boolean;
  componentPath?: string;
}): string => {
  const defaultPath = getGeneratedComponentsDefaultPath({
    isNextJs,
    isUsingSrcDirectory,
  });

  // Assume they will be importing from ./pages/ so we need to go up one level.
  // e.g. "components/metabase" -> "../components/metabase"
  if (isNextJs && !isUsingSrcDirectory) {
    return `../${path.normalize(componentPath || defaultPath)}`;
  }

  if (componentPath === ".") {
    return "..";
  }

  const normalized = path
    .normalize(componentPath || defaultPath)
    .replace(/^\.\//, "");

  const parts = normalized.split("/");

  if (parts.length === 1) {
    return `../${parts[0]}`;
  }

  // We do not want to include the "src" directory in the import path.
  if (parts[0] === "src") {
    parts.shift();
  }

  return `../${parts.join("/")}`;
};
