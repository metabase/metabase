import type {
  Database,
  DatabaseId,
  WorkspaceDatabase,
} from "metabase-types/api";

export type DatabaseRow = {
  id: DatabaseId;
  workspaceDatabase: WorkspaceDatabase;
  database: Database;
};
