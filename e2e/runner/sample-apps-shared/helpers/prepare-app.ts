import fs from "fs";

import * as path from "path";

const ROOT_FOLDER_PATH = path.resolve(__dirname, "../../../..");
import { E2E_TMP_FOLDER_PATH } from "../constants/e2e-tmp-folder-path";

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
  const destinationPath = path.join(rootPath, LOCAL_DIST_PATH);

  fs.cpSync(METABASE_JAR_DIST_PATH, destinationPath, { recursive: true });
}

export function copyLocalEmbeddingSdkPackage(rootPath: string) {
  const destinationPath = path.join(rootPath, LOCAL_DIST_PATH, "embedding-sdk");

  fs.cpSync(EMBEDDING_SDK_DIST_PATH, destinationPath, { recursive: true });
}

// See `docs/developers-guide/e2e-tests.md` for more info
export function copyShoppyMetabaseAppDBDump(rootPath: string) {
  const sourcePath = path.join(
    E2E_TMP_FOLDER_PATH,
    "db_dumps/shoppy_metabase_app_db_dump.sql",
  );

  // The dump must be copied to the Shoppy's `local-dist` directory.
  // After that it will be used by the Shoppy's Docker container when it is built and started.
  const destinationPath = path.join(
    rootPath,
    LOCAL_DIST_PATH,
    "metabase_dump.sql",
  );

  fs.cpSync(sourcePath, destinationPath);
}
