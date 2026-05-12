import type { Database, TableRemapping } from "metabase-types/api";

export type DatabaseInfo = {
  database: Database;
  remappings: TableRemapping[];
};
