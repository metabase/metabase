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

import { useDeleteBookmarkMutation } from "metabase/api";
import CollapseSection from "metabase/common/components/CollapseSection";
import { Sortable } from "metabase/common/components/Sortable";
import GrabberS from "metabase/css/components/grabber.module.css";
import CS from "metabase/css/core/index.css";
import { getIcon } from "metabase/lib/icon";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Icon, Tooltip } from "metabase/ui";
import type { Bookmark } from "metabase-types/api";

import { SidebarHeading } from "../../MainNavbar.styled";
import type { SelectedItem } from "../../types";

import { SidebarBookmarkItem } from "./BookmarkList.styled";

interface CollectionSidebarBookmarksProps {
  bookmarks: Bookmark[];
  selectedItem?: SelectedItem;
  onSelect: () => void;
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
}

function isBookmarkSelected(bookmark: Bookmark, selectedItem?: SelectedItem) {
  if (!selectedItem) {
    return false;
  }
  return (
    bookmark.type === selectedItem.type && bookmark.item_id === selectedItem.id
  );
}

const BookmarkItem = ({
  bookmark,
  isDraggable,
  isSorting,
  selectedItem,
  onSelect,
}: BookmarkItemProps) => {
  const isSelected = isBookmarkSelected(bookmark, selectedItem);
  const url = Urls.bookmark(bookmark);
  const icon = getIcon({
    model: bookmark.card_type === "model" ? "dataset" : bookmark.type,
    display: bookmark.display,
  });

  const [deleteBookmark] = useDeleteBookmarkMutation();
  const onRemove = () =>
    deleteBookmark({ id: bookmark.item_id, type: bookmark.type });

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

export const BookmarkList = ({
  bookmarks,
  selectedItem,
  onSelect,
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

  const headerId = "headingForBookmarksSectionOfSidebar";

  return (
    <CollapseSection
      aria-labelledby={headerId}
      header={<SidebarHeading id={headerId}>{t`Bookmarks`}</SidebarHeading>}
      initialState={initialState}
      iconPosition="right"
      iconSize={8}
      headerClass={CS.mb1}
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
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </CollapseSection>
  );
};
