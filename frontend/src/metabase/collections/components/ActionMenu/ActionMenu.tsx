import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { HACK_getParentCollectionFromEntityUpdateAction } from "metabase/archive/utils";
import { trackCollectionItemBookmarked } from "metabase/collections/analytics";
import type {
  CreateBookmark,
  DeleteBookmark,
  OnCopy,
  OnMove,
} from "metabase/collections/types";
import {
  canArchiveItem,
  canBookmarkItem,
  canCopyItem,
  canMoveItem,
  canPinItem,
  canPreviewItem,
  isItemPinned,
  isPreviewEnabled,
} from "metabase/collections/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { EntityItem } from "metabase/common/components/EntityItem";
import { useToast } from "metabase/common/hooks/use-toast";
import { bookmarks as BookmarkEntity } from "metabase/entities";
import { connect, useDispatch } from "metabase/lib/redux";
import { entityForObject } from "metabase/lib/schema";
import * as Urls from "metabase/lib/urls";
import { getSetting } from "metabase/selectors/settings";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";
import type { State } from "metabase-types/store";

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
  const dispatch = useDispatch();
  const [sendToast] = useToast();
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
    item.setPinned?.(!isItemPinned(item));
  }, [item]);

  const handleCopy = useCallback(() => {
    onCopy?.([item]);
  }, [item, onCopy]);

  const handleMove = useCallback(() => {
    onMove?.([item]);
  }, [item, onMove]);

  const handleArchive = useCallback(() => {
    return item.setArchived ? item.setArchived(true) : Promise.resolve();
  }, [item]);

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
    item?.setCollectionPreview?.(!isPreviewEnabled(item));
  }, [item]);

  const handleRestore = useCallback(async () => {
    const Entity = entityForObject(item);
    const result = await dispatch(
      Entity.actions.update({ id: item.id, archived: false }),
    );
    await dispatch(BookmarkEntity.actions.invalidateLists());

    const entity = Entity.HACK_getObjectFromAction(result);
    const parentCollection = HACK_getParentCollectionFromEntityUpdateAction(
      item,
      result,
    );
    const redirect = getParentEntityLink(entity, parentCollection);

    sendToast({
      message: t`${item.name} has been restored.`,
      actionLabel: t`View`, // could be collection or dashboard
      action: () => dispatch(push(redirect)),
    });
  }, [item, dispatch, sendToast]);

  const handleDeletePermanently = useCallback(() => {
    const Entity = entityForObject(item);
    dispatch(Entity.actions.delete(item));
    sendToast({ message: t`This item has been permanently deleted.` });
  }, [item, dispatch, sendToast]);

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

export function getParentEntityLink(
  updatedEntity: any,
  parentCollection: Pick<Collection, "id" | "name"> | undefined,
) {
  // get link for parent collection
  const parentCollectionLink = parentCollection
    ? Urls.collection(parentCollection)
    : `/collection/root`;

  // get link for parent dashboard if we're dealing with a dashboard question
  const parentDashboardId =
    updatedEntity.type === "question" ? updatedEntity.dashboard_id : undefined;
  const parentDashboardLink = parentDashboardId
    ? Urls.dashboard({ id: parentDashboardId, name: "" })
    : undefined;

  return parentDashboardLink ? parentDashboardLink : parentCollectionLink;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(ActionMenu);
