/* eslint-disable metabase/no-literal-metabase-strings -- request header name */
import type { OnBeforeRequestHandler } from "metabase/api/client";
import type { WorktreeId } from "metabase-types/api";

export const WORKTREE_HEADER = "X-Metabase-Worktree-Id";

export const worktreeHeaderHandler = (
  worktreeId: WorktreeId | null,
): OnBeforeRequestHandler => {
  return async () => {
    if (worktreeId == null) {
      return;
    }
    return { headers: { [WORKTREE_HEADER]: String(worktreeId) } };
  };
};
