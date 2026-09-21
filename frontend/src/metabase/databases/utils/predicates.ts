import type DatabaseEntity from "metabase-lib/v1/metadata/Database";
import type { Database } from "metabase-types/api";

import { getEngineNativeType } from "./engine";

export const getHasDatabaseWithJsonEngine = (
  databases: (Database | DatabaseEntity)[],
) => {
  return databases.some((d) => getEngineNativeType(d.engine) === "json");
};

export const getHasDatabaseWithActionsEnabled = (
  databases: (Database | DatabaseEntity)[],
) => {
  return databases.some(
    (database) => !!database.settings?.["database-enable-actions"],
  );
};
