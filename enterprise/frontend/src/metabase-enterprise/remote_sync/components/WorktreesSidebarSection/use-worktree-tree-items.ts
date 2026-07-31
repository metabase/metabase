import { useCallback, useMemo, useState } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import { buildCollectionTree } from "metabase/common/collections/utils";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import type {
  RemoteSyncWorktree,
  RemoteSyncWorktreeId,
} from "metabase-types/api";

import type { WorktreePlaceholderData } from "./WorktreeTreeNode";

const placeholderItem = (
  worktreeId: RemoteSyncWorktreeId,
  state: WorktreePlaceholderData["state"],
): ITreeNodeItem => ({
  id: `worktree-${worktreeId}-placeholder`,
  name: "",
  icon: "sync",
  nonNavigable: true,
  data: { type: "worktree-placeholder", state },
});

/**
 * Tree items for one worktree's sidebar row: the worktree root with its
 * collection tree as children. The content is loaded lazily on the first
 * expand; until it arrives (and when the worktree is empty) a placeholder
 * child keeps the expand toggle visible and reports the loading/empty state
 * in place of the content.
 */
export const useWorktreeTreeItems = (
  worktree: RemoteSyncWorktree,
): ITreeNodeItem[] => {
  const [hasExpanded, setHasExpanded] = useState(false);
  const handleExpandChange = useCallback(() => setHasExpanded(true), []);

  const { data: collections, isLoading } = useListCollectionsTreeQuery(
    {
      "exclude-archived": true,
      "include-library": true,
      "worktree-id": worktree.id,
    },
    { skip: !hasExpanded },
  );

  return useMemo(() => {
    const collectionItems: ITreeNodeItem[] = buildCollectionTree(
      collections ?? [],
    );

    let children = collectionItems;
    if (collections == null || isLoading) {
      children = [placeholderItem(worktree.id, "loading")];
    } else if (collectionItems.length === 0) {
      children = [placeholderItem(worktree.id, "empty")];
    }

    return [
      {
        id: `worktree-${worktree.id}`,
        name: worktree.branch,
        icon: "git_branch",
        nonNavigable: true,
        data: { type: "worktree-root", onExpandChange: handleExpandChange },
        children,
      },
    ];
  }, [collections, isLoading, worktree, handleExpandChange]);
};
