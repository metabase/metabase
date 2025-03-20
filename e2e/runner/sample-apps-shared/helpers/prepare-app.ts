import fs from "fs";

import * as path from "path";

const ROOT_FOLDER_PATH = path.resolve(__dirname, "../../../..");

const METABASE_JAR_DIST_PATH = path.join(ROOT_FOLDER_PATH, "target/uberjar");

const EMBEDDING_SDK_DIST_PATH = path.join(
  ROOT_FOLDER_PATH,
  "resources/embedding-sdk",
);

const LOCAL_DIST_PATH = "./local-dist";

export function copyExampleEnvFile({
  rootPath,
  dockerEnvExamplePath,
  dockerEnvPath,
}: {
  rootPath: string;
  dockerEnvExamplePath: string;
  dockerEnvPath: string;
}) {
  fs.cpSync(
    path.join(rootPath, dockerEnvExamplePath),
    path.join(rootPath, dockerEnvPath),
  );
}

export function copyLocalMetabaseJar(rootPath: string) {
  const metabaseJarToPath = path.join(rootPath, LOCAL_DIST_PATH);

  fs.cpSync(METABASE_JAR_DIST_PATH, metabaseJarToPath, { recursive: true });
}

export function copyLocalEmbeddingSdkPackage(rootPath: string) {
  const embeddingSdkToPath = path.join(
    rootPath,
    LOCAL_DIST_PATH,
    "embedding-sdk",
  );

  fs.cpSync(EMBEDDING_SDK_DIST_PATH, embeddingSdkToPath, { recursive: true });
}
