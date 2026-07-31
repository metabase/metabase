import { useMemo } from "react";

import { ItemList } from "metabase/common/components/Pickers/EntityPicker";
import { useListWorktreesQuery } from "metabase-enterprise/api";

import { worktreeFolderItem } from "./picker-items";

/** The children of the picker's "Worktrees" folder: one folder per worktree, named by branch. */
export const WorktreesItemList = ({ pathIndex }: { pathIndex: number }) => {
  const { data: worktrees, error, isLoading } = useListWorktreesQuery();

  const items = useMemo(
    () =>
      worktrees
        ?.map(worktreeFolderItem)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [worktrees],
  );

  return (
    <ItemList
      items={items}
      error={error}
      isLoading={isLoading}
      pathIndex={pathIndex}
    />
  );
};
