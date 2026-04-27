import type { WorkspaceDatabase, WorkspaceId } from "metabase-types/api";

export type WorkspaceInfo = {
  id?: WorkspaceId;
  name: string;
  databases: WorkspaceDatabase[];
};
