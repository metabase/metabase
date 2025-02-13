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

  // We don't know where the user will import the component from.
  // We assume they will import from their components directory,
  // so we use the last directory in the path as an example.
  // e.g. "./src/components/metabase" -> "./metabase".
  const importPath = path.basename(componentPath || defaultPath);

  return importPath.startsWith(".") ? importPath : `./${importPath}`;
};
