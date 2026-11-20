import type { RemoteSyncWorktreeId } from "./remote-sync";
export type GlossaryItemId = number;

export type GlossaryItem = {
  id: GlossaryItemId;
  term: string;
  definition: string;
  worktree_id: RemoteSyncWorktreeId | null;
};
