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
import { trackCollectionItemBookmarked } from "metabase/common/collections/analytics";
import type {
  CreateBookmark,
  DeleteBookmark,
  OnCopy,
  OnMove,
} from "metabase/common/collections/types";
import {
  canArchiveItem,
  canBookmarkItem,
  canCopyItem,
  canPreviewItem,
  isItemPinned,
  isPreviewEnabled,
} from "metabase/common/collections/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { EntityItem } from "metabase/common/components/EntityItem";
import {
  canMoveItem,
  canPinItem,
  isPinnable,
  useSetPinned,
} from "metabase/common/hooks";
import { useSetCollectionPreview } from "metabase/common/hooks/use-set-collection-preview";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/selectors/settings";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";

import S from "./ActionMenu.module.css";

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
}

interface ActionMenuStateProps {
  isXrayEnabled: boolean;
}

function getIsBookmarked(item: CollectionItem, bookmarks: Bookmark[]) {
  const normalizedItemModel = normalizeItemModel(item);

  return bookmarks.some(
    (bookmark) =>
      bookmark.type === normalizedItemModel && bookmark.item_id === item.id,
  );
}

// If item.model is `dataset`, that is, this is a Model in a product sense,
// let’s call it "card" because `card` and `dataset` are treated the same in the back-end.
function normalizeItemModel(item: CollectionItem) {
  return item.model === "dataset" || item.model === "metric"
    ? "card"
    : item.model;
}

function mapStateToProps(state: State): ActionMenuStateProps {
  return {
    isXrayEnabled: getSetting(state, "enable-xrays"),
  };
}

function ActionMenu({
  className,
  item,
  bookmarks,
  collection,
  isXrayEnabled,
  onCopy,
  onMove,
  createBookmark,
  deleteBookmark,
}: ActionMenuProps & ActionMenuStateProps) {
  const archive = useSetArchive();
  const restore = useRestore();
  const deleteItem = useDeleteItem();
  const setPinned = useSetPinned();
  const setCollectionPreview = useSetCollectionPreview();
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure();
  const isBookmarked = bookmarks && getIsBookmarked(item, bookmarks);
  const canBookmark = canBookmarkItem(item);
  const canPin = canPinItem(item, collection);
  const canPreview = canPreviewItem(item, collection);
  const canMove = canMoveItem(item, collection);
  const canArchive = canArchiveItem(item, collection);
  const canRestore = item.can_restore;
  const canDelete = item.can_delete;
  const canCopy = onCopy && canCopyItem(item);

  const handlePin = useCallback(() => {
    if (isPinnable(item)) {
      setPinned(item, !isItemPinned(item));
    }
  }, [item, setPinned]);

  const handleCopy = useCallback(() => {
    onCopy?.([item]);
  }, [item, onCopy]);

  const handleMove = useCallback(() => {
    onMove?.([item]);
  }, [item, onMove]);

  const handleArchive = useCallback(
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
      const normalizedModel = normalizeItemModel(item);
      toggleBookmark?.(item.id.toString(), normalizedModel);
    };
    return handler;
  }, [createBookmark, deleteBookmark, isBookmarked, item]);

  const handleTogglePreview = useCallback(() => {
    setCollectionPreview(item.id, !isPreviewEnabled(item));
  }, [item, setCollectionPreview]);

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
      <EntityItem.Menu
        className={`${S.EntityItemMenu} ${className || ""}`}
        item={item}
        isBookmarked={isBookmarked}
        isXrayEnabled={!item.archived && isXrayEnabled}
        onPin={canPin ? handlePin : undefined}
        onMove={canMove ? handleMove : undefined}
        onCopy={canCopy ? handleCopy : undefined}
        onArchive={canArchive ? handleArchive : undefined}
        onToggleBookmark={canBookmark ? handleToggleBookmark : undefined}
        onTogglePreview={canPreview ? handleTogglePreview : undefined}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(ActionMenu);
