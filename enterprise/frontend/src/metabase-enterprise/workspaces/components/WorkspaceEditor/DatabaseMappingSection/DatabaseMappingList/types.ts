import type {
  Database,
  DatabaseId,
  WorkspaceDatabaseDraft,
} from "metabase-types/api";

export type WorkspaceDatabaseRow = {
  id: DatabaseId;
  database?: Database;
  mapping: WorkspaceDatabaseDraft;
};
