import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext, PointerSensor, useSensor } from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import CollapseSection from "metabase/common/components/CollapseSection";
import { Sortable } from "metabase/common/components/Sortable";
import GrabberS from "metabase/css/components/grabber.module.css";
import Bookmarks from "metabase/entities/bookmarks";
import { getIcon } from "metabase/lib/icon";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Icon, Tooltip } from "metabase/ui";
import type { Bookmark } from "metabase-types/api";

import { SidebarHeading } from "../../MainNavbar.styled";
import type { SelectedItem } from "../../types";

import { SidebarBookmarkItem } from "./BookmarkList.styled";

const mapDispatchToProps = {
  onDeleteBookmark: ({ item_id, type }: Bookmark) =>
    Bookmarks.actions.delete({ id: item_id, type }),
};

interface CollectionSidebarBookmarksProps {
  bookmarks: Bookmark[];
  selectedItem?: SelectedItem;
  onSelect: () => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
  reorderBookmarks: ({
    newIndex,
    oldIndex,
  }: {
    newIndex: number;
    oldIndex: number;
  }) => Promise<any>;
  onToggle: (isExpanded: boolean) => void;
  initialState: "expanded" | "collapsed";
}

interface BookmarkItemProps {
  bookmark: Bookmark;
  index: number;
  isDraggable?: boolean;
  isSorting: boolean;
  selectedItem?: SelectedItem;
  onSelect: () => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
}

function isBookmarkSelected(bookmark: Bookmark, selectedItem?: SelectedItem) {
  if (!selectedItem) {
    return false;
  }
  return (
    bookmark.type === selectedItem.type && bookmark.item_id === selectedItem.id
  );
}

function getBookmarkModel(bookmark: Bookmark) {
  // we should really fix this on the backend
  return bookmark.card_type === "model" ? "dataset" : bookmark.type;
}

const BookmarkItem = ({
  bookmark,
  isDraggable,
  isSorting,
  selectedItem,
  onSelect,
  onDeleteBookmark,
}: BookmarkItemProps) => {
  const isSelected = isBookmarkSelected(bookmark, selectedItem);
  const url = Urls.bookmark(bookmark);

  const icon = getIcon({
    model: getBookmarkModel(bookmark),
    display: bookmark.display,
  });
  const onRemove = () => onDeleteBookmark(bookmark);

  const isIrregularCollection =
    bookmark.type === "collection" &&
    !PLUGIN_COLLECTIONS.isRegularCollection(bookmark);

  const iconName = isSelected ? "bookmark_filled" : "bookmark";

  return (
    <Sortable id={bookmark.id} key={bookmark.id}>
      <SidebarBookmarkItem
        key={`bookmark-${bookmark.id}`}
        url={url}
        icon={icon}
        isSelected={isSelected}
        isDragging={isSorting}
        isDraggable={isDraggable}
        hasDefaultIconStyle={!isIrregularCollection}
        onClick={onSelect}
        right={
          <button onClick={onRemove}>
            <Tooltip label={t`Remove bookmark`} position="bottom">
              <Icon name={iconName} />
            </Tooltip>
          </button>
        }
      >
        {bookmark.name}
      </SidebarBookmarkItem>
    </Sortable>
  );
};

const BookmarkList = ({
  bookmarks,
  selectedItem,
  onSelect,
  onDeleteBookmark,
  reorderBookmarks,
  onToggle,
  initialState,
}: CollectionSidebarBookmarksProps) => {
  const [orderedBookmarks, setOrderedBookmarks] = useState(bookmarks);
  const [isSorting, setIsSorting] = useState(false);

  useEffect(() => {
    setOrderedBookmarks(bookmarks);
  }, [bookmarks]);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 15 },
  });

  const handleSortStart = useCallback(() => {
    document.body.classList.add(GrabberS.grabbing);
    setIsSorting(true);
  }, []);

  const handleSortEnd = useCallback(
    async (input: DragEndEvent) => {
      document.body.classList.remove(GrabberS.grabbing);
      setIsSorting(false);
      const newIndex = bookmarks.findIndex((b) => b.id === input.over?.id);
      const oldIndex = bookmarks.findIndex((b) => b.id === input.active.id);
      await reorderBookmarks({ newIndex, oldIndex });
    },
    [reorderBookmarks, bookmarks],
  );

  const bookmarkIds = bookmarks.map((b) => b.id);

  return (
    <CollapseSection
      header={<SidebarHeading>{t`Bookmarks`}</SidebarHeading>}
      initialState={initialState}
      iconPosition="right"
      iconSize={8}
      role="section"
      aria-label={t`Bookmarks`}
      onToggle={onToggle}
    >
      <DndContext
        onDragEnd={handleSortEnd}
        onDragStart={handleSortStart}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        sensors={[pointerSensor]}
      >
        <SortableContext
          items={bookmarkIds ?? []}
          strategy={verticalListSortingStrategy}
        >
          <ul>
            {orderedBookmarks.map((bookmark, index) => (
              <BookmarkItem
                bookmark={bookmark}
                isDraggable={orderedBookmarks.length > 1}
                isSorting={isSorting}
                key={index}
                index={index}
                selectedItem={selectedItem}
                onSelect={onSelect}
                onDeleteBookmark={onDeleteBookmark}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </CollapseSection>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(BookmarkList);
