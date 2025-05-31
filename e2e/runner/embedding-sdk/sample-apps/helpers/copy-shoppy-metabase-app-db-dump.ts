import fs from "fs";
import * as path from "path";

import { E2E_TMP_FOLDER_PATH } from "../constants/e2e-tmp-folder-path";

const LOCAL_DIST_PATH = "./local-dist";

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
