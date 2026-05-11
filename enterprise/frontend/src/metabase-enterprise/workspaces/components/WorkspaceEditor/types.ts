import type {
  DatabaseId,
  WorkspaceDatabaseInput,
  WorkspaceId,
} from "metabase-types/api";

export type WorkspaceDatabaseInfo = {
  database_id: DatabaseId | undefined;
  input: WorkspaceDatabaseInput[];
};

export type WorkspaceInfo = {
  id: WorkspaceId | undefined;
  name: string;
  databases: WorkspaceDatabaseInfo[];
};
