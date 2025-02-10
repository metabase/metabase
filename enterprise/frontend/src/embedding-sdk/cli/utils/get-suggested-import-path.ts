import path from "path";

import {
  GENERATED_COMPONENTS_DEFAULT_PATH,
  GENERATED_COMPONENTS_DEFAULT_PATH_NEXTJS,
} from "../constants/config";

export const getSuggestedImportPath = ({
  isNextJs,
  componentPath,
}: {
  isNextJs: boolean;
  componentPath?: string;
}): string => {
  // Assume they will be importing from ./pages/ so we need to go up one level.
  // e.g. "components/metabase" -> "../components/metabase"
  if (isNextJs) {
    return `../${path.normalize(componentPath || GENERATED_COMPONENTS_DEFAULT_PATH_NEXTJS)}`;
  }

  // We don't know where the user will import the component from.
  // We assume they will import from their components directory,
  // so we use the last directory in the path as an example.
  // e.g. "./src/components/metabase" -> "./metabase".
  const importPath = path.basename(
    componentPath || GENERATED_COMPONENTS_DEFAULT_PATH,
  );

  return importPath.startsWith(".") ? importPath : `./${importPath}`;
};
