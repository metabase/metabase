import type {
  Database,
  DatabaseId,
  WorkspaceDatabase,
} from "metabase-types/api";

export type DatabaseMappingRow = {
  id: DatabaseId;
  mapping: WorkspaceDatabase;
  database?: Database;
};
