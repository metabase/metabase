import { skipToken } from "metabase/api";
import { useWorktreeId } from "metabase/common/worktrees";
import type { WorktreeBreadcrumb } from "metabase/plugins";
import * as Urls from "metabase/urls";
import { useGetWorktreeQuery } from "metabase-enterprise/api";

/**
 * The worktree the current page is scoped to, as a leading breadcrumb item linking to the
 * worktree's transforms list; null in the main app (or until the worktree has loaded — pages
 * inside WorktreeLayout share its cached query, so in practice it is available immediately).
 */
export function useWorktreeBreadcrumb(): WorktreeBreadcrumb | null {
  const worktreeId = useWorktreeId();
  const { data: worktree } = useGetWorktreeQuery(worktreeId ?? skipToken);

  if (worktreeId == null || worktree == null) {
    return null;
  }

  return {
    branch: worktree.branch,
    url: Urls.transformList({ worktreeId }),
  };
}
