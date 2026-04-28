import type {
  UserInfo,
  WorkspaceDatabase,
  WorkspaceId,
} from "metabase-types/api";

export type WorkspaceInfo = {
  id?: WorkspaceId;
  name: string;
  databases: WorkspaceDatabase[];
  creator?: UserInfo | null;
  created_at?: string;
};
