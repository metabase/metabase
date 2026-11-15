import type { Database } from "metabase-types/api";

import { getEngineNativeType } from "./engine";

export const getHasDatabaseWithJsonEngine = (databases: Database[]) => {
  return databases.some((d) => getEngineNativeType(d.engine) === "json");
};

export const getHasDatabaseWithActionsEnabled = (databases: Database[]) => {
  return databases.some(
    (database) => !!database.settings?.["database-enable-actions"],
  );
};
