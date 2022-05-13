import { Database } from "metabase-types/types/Database";

const DB_WRITEBACK_SETTING = "database-enable-actions";

export const isDatabaseWritebackEnabled = (database: Database) =>
  !!database?.settings?.[DB_WRITEBACK_SETTING];
