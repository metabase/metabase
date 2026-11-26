import type { RemoteSyncWorktree } from "metabase-types/api";

export type WorktreeRow = RemoteSyncWorktree & {
  isCheckedOut: boolean;
  createdBy: string;
  checkedOutBy: string;
};

export type WorktreeRowActions = {
  onCheckout: (worktree: WorktreeRow) => void;
  onDelete: (worktree: WorktreeRow) => void;
};
