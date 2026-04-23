import type {
  Database,
  DatabaseId,
  WorkspaceInstanceDatabase,
} from "metabase-types/api";

export type WorkspaceOverviewDatabaseRow = {
  databaseId: DatabaseId;
  database?: Database;
  config: WorkspaceInstanceDatabase;
};
