import type { WorkspaceDatabaseDraft, WorkspaceId } from "metabase-types/api";

export type WorkspaceInfo = {
  id?: WorkspaceId;
  name: string;
  databases: WorkspaceDatabaseDraft[];
};
