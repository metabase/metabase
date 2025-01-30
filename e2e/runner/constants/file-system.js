import path from "path";

export const E2E_TMP_FOLDER_NAME = "tmp";
export const E2E_TMP_FOLDER_PATH = path.resolve(
  __dirname,
  "../../",
  E2E_TMP_FOLDER_NAME,
);

export const RESOURCES_FOLDER_PATH = path.resolve(
  __dirname,
  "../../../resources",
);

export const EMBEDDING_SDK_DIST_PATH = path.join(
  RESOURCES_FOLDER_PATH,
  "embedding-sdk",
);
