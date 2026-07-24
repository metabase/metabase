import type { UserId } from "./user";

export type WorkspaceId = number;

export interface Workspace {
  id: WorkspaceId;
  branch: string;
  creator_id: UserId | null;
  created_at: string;
  updated_at: string;
  // Last synced git SHA for this workspace; null until the first successful pull
  base_version: string | null;
}
