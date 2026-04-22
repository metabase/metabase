import type { WorkspaceDatabaseDraft } from "metabase-types/api";

export type WorkspaceInfo = {
  name: string;
  databases: WorkspaceDatabaseDraft[];
};
