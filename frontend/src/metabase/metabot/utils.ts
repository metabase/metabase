import { getEngineNativeType } from "metabase/lib/engine";
import Database from "metabase-lib/metadata/Database";

export const canUseMetabotOnDatabase = (database: Database) => {
  return (
    database.features.includes("nested-queries") &&
    database.canWrite() &&
    getEngineNativeType(database.engine) === "sql"
  );
};
