import { collectionApi } from "metabase/api";
import type { OmniPickerCollectionItem } from "metabase/common/components/Pickers";
import { allCollectionModels } from "metabase/common/components/Pickers/EntityPicker/utils";
import type { DispatchFn } from "metabase/redux";
import { remoteSyncApi } from "metabase-enterprise/api/remote-sync";
import type { Collection } from "metabase-types/api";

import { worktreeFolderItem, worktreesPickerRootItem } from "./picker-items";

/**
 * Picker path prefix for a collection checked out into a worktree: the "Worktrees"
 * folder, the worktree's own folder, and the collection's root-level ancestor within
 * the worktree (the collection itself when it is root-level). Null when the worktree
 * can't be resolved, in which case the picker falls back to its default path.
 */
export async function getWorktreePickerBasePath({
  collection,
  dispatch,
}: {
  collection: Collection;
  dispatch: DispatchFn;
}): Promise<OmniPickerCollectionItem[] | null> {
  const worktreeId = collection.worktree_id;
  if (worktreeId == null) {
    return null;
  }

  const worktrees = await dispatch(
    remoteSyncApi.endpoints.listWorktrees.initiate(),
  )
    .unwrap()
    .catch(() => null);
  const worktree = worktrees?.find(({ id }) => id === worktreeId);
  if (!worktree) {
    return null;
  }

  const location = collection.effective_location ?? collection.location ?? "/";
  const [rootAncestorId] = location.split("/").filter(Boolean).map(Number);

  const rootAncestor = rootAncestorId
    ? await dispatch(
        collectionApi.endpoints.getCollection.initiate({ id: rootAncestorId }),
      )
        .unwrap()
        .catch(() => null)
    : collection;
  if (!rootAncestor) {
    return null;
  }

  return [
    worktreesPickerRootItem(),
    worktreeFolderItem(worktree),
    {
      id: rootAncestor.id,
      name: rootAncestor.name,
      model: "collection",
      can_write: rootAncestor.can_write,
      here: ["collection"],
      below: allCollectionModels,
    },
  ];
}
