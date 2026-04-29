import type {
  Database,
  DatabaseId,
  WorkspaceInstanceDatabase,
} from "metabase-types/api";

export type WorkspaceOverviewDatabaseRow = {
  id: DatabaseId;
  database?: Database;
  config: WorkspaceInstanceDatabase;
};
