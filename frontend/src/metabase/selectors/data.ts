import { getEngineNativeType } from "metabase/lib/engine";
import type DatabaseEntity from "metabase-lib/v1/metadata/Database";
import type { Database } from "metabase-types/api";

export const getHasDataAccess = (databases: (Database | DatabaseEntity)[]) => {
  return databases.some(d => !d.is_saved_questions);
};

export const getHasOwnDatabase = (databases: (Database | DatabaseEntity)[]) => {
  return databases.some(d => !d.is_sample && !d.is_saved_questions);
};

export const getHasNativeWrite = (databases: (Database | DatabaseEntity)[]) => {
  return databases.some(d => d.native_permissions === "write");
};

export const getHasDatabaseWithJsonEngine = (
  databases: (Database | DatabaseEntity)[],
) => {
  return databases.some(d => getEngineNativeType(d.engine) === "json");
};

export const getHasDatabaseWithActionsEnabled = (
  databases: (Database | DatabaseEntity)[],
) => {
  return databases.some(
    database => !!database.settings?.["database-enable-actions"],
  );
};
