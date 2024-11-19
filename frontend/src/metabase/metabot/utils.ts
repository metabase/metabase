import { getEngineNativeType } from "metabase/lib/engine";
import type Database from "metabase-lib/v1/metadata/Database";

export const canUseMetabotOnDatabase = (database: Database) => {
  return (
    database.features?.includes("nested-queries") &&
    canGenerateQueriesForDatabase(database)
  );
};

export const canGenerateQueriesForDatabase = (database: Database) =>
  database.canWrite() && getEngineNativeType(database.engine) === "sql";
