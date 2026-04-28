import type {
  Database,
  DatabaseId,
  WorkspaceDatabase,
} from "metabase-types/api";

export type DatabaseConfigRow = {
  id: DatabaseId;
  config: WorkspaceDatabase;
  database?: Database;
};
