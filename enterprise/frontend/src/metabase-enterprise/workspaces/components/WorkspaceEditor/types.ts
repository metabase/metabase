import type {
  WorkspaceDatabaseParams,
  WorkspaceDatabaseStauts,
  WorkspaceId,
} from "metabase-types/api";

export type WorkspaceDatabaseInfo = WorkspaceDatabaseParams & {
  status?: WorkspaceDatabaseStauts;
};

export type WorkspaceInfo = {
  id?: WorkspaceId;
  name: string;
  databases: WorkspaceDatabaseInfo[];
};
