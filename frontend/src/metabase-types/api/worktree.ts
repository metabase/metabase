import type { UserId, UserInfo } from "./user";

export type WorktreeId = number;

export type Worktree = {
  id: WorktreeId;
  branch: string;
  creator_id: UserId | null;
  created_at: string;
  updated_at: string;
  creator?: UserInfo | null;
};

export type CreateWorktreeRequest = {
  branch: string;
};
