import path from "path";

export const ROOT_FOLDER_PATH = path.resolve(__dirname, "../../../..");

export const METABASE_JAR_DIST_PATH = path.join(
  ROOT_FOLDER_PATH,
  "target/uberjar",
);

export const EMBEDDING_SDK_DIST_PATH = path.join(
  ROOT_FOLDER_PATH,
  "resources/embedding-sdk",
);

export const LOCAL_DIST_PATH = "./local-dist";
