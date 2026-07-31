import { useMemo } from "react";

import { skipToken, useListCollectionsQuery } from "metabase/api";
import type {
  OmniPickerFolderItem,
  OmniPickerItem,
} from "metabase/common/components/Pickers";
import { ItemList } from "metabase/common/components/Pickers/EntityPicker";
import { allCollectionModels } from "metabase/common/components/Pickers/EntityPicker/utils";
import type { Collection } from "metabase-types/api";

import { parseWorktreeFolderId } from "./picker-items";

/**
 * The children of one worktree's folder in the picker: the worktree's root-level
 * collections. Anything deeper is served by the standard collection item list —
 * collection children are scoped to their collection's worktree server-side.
 */
export const WorktreeCollectionsItemList = ({
  parentItem,
  pathIndex,
}: {
  parentItem: OmniPickerFolderItem;
  pathIndex: number;
}) => {
  const worktreeId = parseWorktreeFolderId(parentItem.id);

  const {
    data: collections,
    error,
    isLoading,
  } = useListCollectionsQuery(
    worktreeId != null ? { "worktree-id": worktreeId } : skipToken,
  );

  const items = useMemo(
    () => getWorktreeRootCollections(collections),
    [collections],
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

const getWorktreeRootCollections = (
  collections?: Collection[],
): OmniPickerItem[] | undefined =>
  collections
    ?.filter(
      (collection) => collection.id !== "root" && collection.location === "/",
    )
    .map(
      (collection): OmniPickerItem => ({
        ...collection,
        model: "collection",
        // the list endpoint doesn't report content types, so keep folders expandable
        here: ["collection"],
        below: allCollectionModels,
      }),
    );
