import path from "path";

import { GENERATED_COMPONENTS_DEFAULT_PATH } from "../constants/config";

export const getExampleComponentImportPath = (
  reactComponentDir = GENERATED_COMPONENTS_DEFAULT_PATH,
) => {
  const baseDir =
    reactComponentDir === "." ? "" : `/${path.basename(reactComponentDir)}`;

  return "<path-to-your-components>" + baseDir;
};
