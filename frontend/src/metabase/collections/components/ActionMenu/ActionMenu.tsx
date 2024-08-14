import { useCallback, useMemo } from "react";
import { connect } from "react-redux";

import type {
  CreateBookmark,
  DeleteBookmark,
  OnCopy,
  OnMove,
} from "metabase/collections/types";
import {
  canArchiveItem,
  canMoveItem,
  canPinItem,
  canPreviewItem,
  isItemPinned,
  isPreviewEnabled,
} from "metabase/collections/utils";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
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
  isMetabotEnabled: boolean;
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
  return item.model === "dataset" ? "card" : item.model;
}

function mapStateToProps(state: State): ActionMenuStateProps {
  return {
    isXrayEnabled: getSetting(state, "enable-xrays"),
    isMetabotEnabled: getSetting(state, "is-metabot-enabled"),
  };
}

function ActionMenu({
  className,
  item,
  databases,
  bookmarks,
  collection,
  isXrayEnabled,
  isMetabotEnabled,
  onCopy,
  onMove,
  createBookmark,
  deleteBookmark,
}: ActionMenuProps & ActionMenuStateProps) {
  const database = databases?.find(({ id }) => id === item.database_id);
  const isBookmarked = bookmarks && getIsBookmarked(item, bookmarks);
  const canPin = canPinItem(item, collection);
  const canPreview = canPreviewItem(item, collection);
  const canMove = canMoveItem(item, collection);
  const canArchive = canArchiveItem(item, collection);
  const canUseMetabot =
    database != null && canUseMetabotOnDatabase(database) && isMetabotEnabled;

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
    item.setArchived?.(true);
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

  return (
    <EntityItemMenu
      className={className}
      item={item}
      isBookmarked={isBookmarked}
      isXrayEnabled={isXrayEnabled}
      canUseMetabot={canUseMetabot}
      onPin={canPin ? handlePin : undefined}
      onMove={canMove ? handleMove : undefined}
      onCopy={item.copy ? handleCopy : undefined}
      onArchive={canArchive ? handleArchive : undefined}
      onToggleBookmark={handleToggleBookmark}
      onTogglePreview={canPreview ? handleTogglePreview : undefined}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(ActionMenu);
