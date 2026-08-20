import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import {
  type ArchivableItem,
  isDeletable,
  isRestorable,
  useDeleteItem,
  useRestore,
  useSetArchive,
} from "metabase/archive/hooks";
import {
  setCollectionItemPinnedAndTrack,
  trackCollectionItemBookmarked,
} from "metabase/common/collections/analytics";
import type {
  CreateBookmark,
  DeleteBookmark,
  OnCopy,
  OnMove,
  OnToggleSelected,
} from "metabase/common/collections/types";
import {
  canArchiveItem,
  canBookmarkItem,
  canCopyItem,
  getItemBookmarkType,
  isItemBookmarked,
  isItemPinned,
} from "metabase/common/collections/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { canSelectItems } from "metabase/common/components/ItemsTable/utils";
import {
  canMoveItem,
  canPinItem,
  isPinnable,
  useSetPinned,
} from "metabase/common/hooks";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";
import type {
  Bookmark,
  Collection,
  CollectionItem,
  Database,
} from "metabase-types/api";

import S from "./ActionMenu.module.css";
import { EntityItemMenu } from "./EntityItemMenu";

export interface ActionMenuProps {
  className?: string;
  item: CollectionItem;
  collection?: Collection;
  databases?: Database[];
  bookmarks?: Bookmark[];
  onCopy?: OnCopy;
  onMove?: OnMove;
  createBookmark?: CreateBookmark;
  deleteBookmark?: DeleteBookmark;
  isSelected?: boolean;
  onToggleSelected?: OnToggleSelected;
}

interface ActionMenuStateProps {
  isXrayEnabled: boolean;
}

function mapStateToProps(state: State): ActionMenuStateProps {
  return {
    isXrayEnabled: getSetting(state, "enable-xrays"),
  };
}

function ActionMenuInner({
  className,
  item,
  bookmarks,
  collection,
  isXrayEnabled,
  onCopy,
  onMove,
  createBookmark,
  deleteBookmark,
  isSelected,
  onToggleSelected,
}: ActionMenuProps & ActionMenuStateProps) {
  const archive = useSetArchive();
  const restore = useRestore();
  const deleteItem = useDeleteItem();
  const setPinned = useSetPinned();
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure();
  const isBookmarked = bookmarks && isItemBookmarked(item, bookmarks);
  const canBookmark = canBookmarkItem(item);
  const canPin = canPinItem(item, collection);
  const canMove = canMoveItem(item, collection);
  const canArchive = canArchiveItem(item, collection);
  const canRestore = item.can_restore;
  const canDelete = item.can_delete;
  const canCopy = onCopy && canCopyItem(item);
  const canSelect = canSelectItems(collection, onToggleSelected);

  const handlePin = useCallback(() => {
    if (isPinnable(item)) {
      const pinned = !isItemPinned(item);
      void setCollectionItemPinnedAndTrack({
        item,
        pinned,
        triggeredFrom: "item_menu",
        setPinned: () => setPinned(item, pinned),
      });
    }
  }, [item, setPinned]);

  const handleCopy = useCallback(() => {
    onCopy?.([item]);
  }, [item, onCopy]);

  const handleMove = useCallback(() => {
    onMove?.([item]);
  }, [item, onMove]);

  const handleArchive = useCallback(
    // Unjustified type cast. FIXME
    () => archive(item as ArchivableItem, true),
    [archive, item],
  );

  const handleToggleBookmark = useMemo(() => {
    if (!createBookmark && !deleteBookmark) {
      return undefined;
    }

    const handler = () => {
      const toggleBookmark = isBookmarked ? deleteBookmark : createBookmark;

      if (!isBookmarked) {
        trackCollectionItemBookmarked(item);
      }
      toggleBookmark?.({ id: item.id, type: getItemBookmarkType(item) });
    };
    return handler;
  }, [createBookmark, deleteBookmark, isBookmarked, item]);

  const handleRestore = useCallback(async () => {
    if (!isRestorable(item)) {
      return;
    }
    await restore(item);
  }, [item, restore]);

  const handleDeletePermanently = useCallback(async () => {
    if (!isDeletable(item)) {
      return;
    }
    await deleteItem(item);
  }, [item, deleteItem]);

  return (
    <>
      <EntityItemMenu
        className={`${S.EntityItemMenu} ${className || ""}`}
        item={item}
        isBookmarked={isBookmarked}
        isSelected={isSelected}
        isXrayEnabled={!item.archived && isXrayEnabled}
        onPin={canPin ? handlePin : undefined}
        onToggleSelected={canSelect ? onToggleSelected : undefined}
        onMove={canMove ? handleMove : undefined}
        onCopy={canCopy ? handleCopy : undefined}
        onArchive={canArchive ? handleArchive : undefined}
        onToggleBookmark={canBookmark ? handleToggleBookmark : undefined}
        onRestore={canRestore ? handleRestore : undefined}
        onDeletePermanently={canDelete ? openModal : undefined}
      />
      <ConfirmModal
        opened={modalOpened}
        confirmButtonText={t`Delete permanently`}
        data-testid="delete-confirmation"
        message={t`This can't be undone.`}
        title={t`Delete ${item.name} permanently?`}
        onConfirm={handleDeletePermanently}
        onClose={closeModal}
      />
    </>
  );
}

export const ActionMenu = connect(mapStateToProps)(ActionMenuInner);
