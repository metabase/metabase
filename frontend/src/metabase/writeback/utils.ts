import Database from "metabase-lib/lib/metadata/Database";
import { Database as IDatabase } from "metabase-types/types/Database";

const DB_WRITEBACK_FEATURE = "actions";
const DB_WRITEBACK_SETTING = "database-enable-actions";

export const isDatabaseWritebackEnabled = (database?: IDatabase | null) =>
  !!database?.settings?.[DB_WRITEBACK_SETTING];

export const isWritebackSupported = (database?: Database | null) =>
  !!database?.hasFeature(DB_WRITEBACK_FEATURE);
