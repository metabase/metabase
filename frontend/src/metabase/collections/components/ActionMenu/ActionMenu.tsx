import React, { useCallback } from "react";
import { connect } from "react-redux";
import EventSandbox from "metabase/components/EventSandbox";
import { getSetting } from "metabase/selectors/settings";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import {
  canArchiveItem,
  canMoveItem,
  canPinItem,
  canPreviewItem,
  isItemPinned,
  isPreviewEnabled,
} from "metabase/collections/utils";
import { Bookmark, Collection, CollectionItem } from "metabase-types/api";
import { State } from "metabase-types/store";
import { canUseMetabotOnDatabase } from "metabase/metabot/utils";
import Database from "metabase-lib/metadata/Database";
import { EntityItemMenu } from "./ActionMenu.styled";

interface OwnProps {
  className?: string;
  item: CollectionItem;
  collection: Collection;
  databases?: Database[];
  bookmarks?: Bookmark[];
  onCopy: (items: CollectionItem[]) => void;
  onMove: (items: CollectionItem[]) => void;
  createBookmark?: (id: string, collection: string) => void;
  deleteBookmark?: (id: string, collection: string) => void;
}

interface StateProps {
  isXrayEnabled: boolean;
  isMetabotEnabled: boolean;
}

type ActionMenuProps = OwnProps & StateProps;

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

function mapStateToProps(state: State): StateProps {
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
}: ActionMenuProps) {
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
    onCopy([item]);
  }, [item, onCopy]);

  const handleMove = useCallback(() => {
    onMove([item]);
  }, [item, onMove]);

  const handleArchive = useCallback(() => {
    item.setArchived?.(true);
  }, [item]);

  const handleToggleBookmark = useCallback(() => {
    const toggleBookmark = isBookmarked ? deleteBookmark : createBookmark;
    toggleBookmark?.(item.id.toString(), normalizeItemModel(item));
  }, [createBookmark, deleteBookmark, isBookmarked, item]);

  const handleTogglePreview = useCallback(() => {
    item?.setCollectionPreview?.(!isPreviewEnabled(item));
  }, [item]);

  return (
    // this component is used within a `<Link>` component,
    // so we must prevent events from triggering the activation of the link
    <EventSandbox preventDefault>
      <EntityItemMenu
        className={className}
        item={item}
        isBookmarked={isBookmarked}
        isXrayEnabled={isXrayEnabled}
        canUseMetabot={canUseMetabot}
        onPin={canPin ? handlePin : null}
        onMove={canMove ? handleMove : null}
        onCopy={item.copy ? handleCopy : null}
        onArchive={canArchive ? handleArchive : null}
        onToggleBookmark={handleToggleBookmark}
        onTogglePreview={canPreview ? handleTogglePreview : null}
        analyticsContext={ANALYTICS_CONTEXT}
      />
    </EventSandbox>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps)(ActionMenu);
