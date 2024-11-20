import path from "path";

// We don't actually know which path the user will import the component from.
// We assume they will import from their components directory,
// so we use the last directory in the path as an example.
// e.g. "./src/components/metabase" -> "./metabase".
import { GENERATED_COMPONENTS_DEFAULT_PATH } from "../constants/config";

export const getSuggestedImportPath = (componentDir?: string): string => {
  const importPath = path.basename(
    componentDir || GENERATED_COMPONENTS_DEFAULT_PATH,
  );

  return importPath.startsWith(".") ? importPath : `./${importPath}`;
};
