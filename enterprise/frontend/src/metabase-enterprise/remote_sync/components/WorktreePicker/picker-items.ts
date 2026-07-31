import { t } from "ttag";

import type {
  OmniPickerCollectionItem,
  OmniPickerItem,
} from "metabase/common/components/Pickers";
import { allCollectionModels } from "metabase/common/components/Pickers/EntityPicker/utils";
import type {
  RemoteSyncWorktree,
  RemoteSyncWorktreeId,
} from "metabase-types/api";

/** Sentinel id of the picker's top-level "Worktrees" folder. */
export const WORKTREES_PICKER_ROOT_ID = "worktrees";

const WORKTREE_FOLDER_ID_PREFIX = "worktree-";

const worktreeFolderId = (worktreeId: RemoteSyncWorktreeId) =>
  `${WORKTREE_FOLDER_ID_PREFIX}${worktreeId}`;

/** The worktree id encoded in a worktree folder's sentinel id, or null for any other item id. */
export const parseWorktreeFolderId = (
  itemId: OmniPickerItem["id"],
): RemoteSyncWorktreeId | null => {
  if (
    typeof itemId !== "string" ||
    !itemId.startsWith(WORKTREE_FOLDER_ID_PREFIX)
  ) {
    return null;
  }
  const worktreeId = Number(itemId.slice(WORKTREE_FOLDER_ID_PREFIX.length));
  return Number.isInteger(worktreeId) && worktreeId > 0 ? worktreeId : null;
};

export const isWorktreesRootItem = (item: OmniPickerItem): boolean =>
  item.model === "collection" && item.id === WORKTREES_PICKER_ROOT_ID;

export const isWorktreeFolderItem = (item: OmniPickerItem): boolean =>
  item.model === "collection" && parseWorktreeFolderId(item.id) != null;

export const worktreesPickerRootItem = (): OmniPickerCollectionItem => ({
  id: WORKTREES_PICKER_ROOT_ID,
  name: t`Worktrees`,
  model: "collection",
  can_write: false,
  location: "/",
  here: ["collection"],
  below: allCollectionModels,
});

export const worktreeFolderItem = (
  worktree: RemoteSyncWorktree,
): OmniPickerCollectionItem => ({
  id: worktreeFolderId(worktree.id),
  name: worktree.branch,
  model: "collection",
  can_write: false,
  location: "/",
  here: ["collection"],
  below: allCollectionModels,
});
