import { useCallback, useMemo, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { t } from "ttag";

import { HACK_getParentCollectionFromEntityUpdateAction } from "metabase/archive/utils";
import type {
  CreateBookmark,
  DeleteBookmark,
  OnCopy,
  OnMove,
} from "metabase/collections/types";
import {
  canArchiveItem,
  canCopyItem,
  canMoveItem,
  canPinItem,
  canPreviewItem,
  isItemPinned,
  isPreviewEnabled,
} from "metabase/collections/utils";
import { ConfirmDeleteModal } from "metabase/components/ConfirmDeleteModal";
import { bookmarks as BookmarkEntity } from "metabase/entities";
import { useDispatch } from "metabase/lib/redux";
import { entityForObject } from "metabase/lib/schema";
import * as Urls from "metabase/lib/urls";
import { addUndo } from "metabase/redux/undo";
import { getSetting } from "metabase/selectors/settings";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, CollectionItem } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { EntityItemMenu } from "./ActionMenu.styled";

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
    bookmark =>
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const isBookmarked = bookmarks && getIsBookmarked(item, bookmarks);
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
      toggleBookmark?.(item.id.toString(), normalizeItemModel(item));
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

    dispatch(
      addUndo({
        icon: "check",
        message: t`${item.name} has been restored.`,
        actionLabel: t`View`, // could be collection or dashboard
        action: () => dispatch(push(redirect)),
        undo: false,
      }),
    );
  }, [item, dispatch]);

  const handleStartDeletePermanently = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const handleDeletePermanently = useCallback(() => {
    const Entity = entityForObject(item);
    dispatch(Entity.actions.delete(item));
    dispatch(addUndo({ message: t`This item has been permanently deleted.` }));
  }, [item, dispatch]);

  return (
    <>
      <EntityItemMenu
        className={className}
        item={item}
        isBookmarked={isBookmarked}
        isXrayEnabled={!item.archived && isXrayEnabled}
        onPin={canPin ? handlePin : undefined}
        onMove={canMove ? handleMove : undefined}
        onCopy={canCopy ? handleCopy : undefined}
        onArchive={canArchive ? handleArchive : undefined}
        onToggleBookmark={!item.archived ? handleToggleBookmark : undefined}
        onTogglePreview={canPreview ? handleTogglePreview : undefined}
        onRestore={canRestore ? handleRestore : undefined}
        onDeletePermanently={
          canDelete ? handleStartDeletePermanently : undefined
        }
      />
      {showDeleteModal && (
        <ConfirmDeleteModal
          name={item.name}
          onClose={() => setShowDeleteModal(false)}
          onDelete={handleDeletePermanently}
        />
      )}
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
