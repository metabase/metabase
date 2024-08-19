import type { DragEndEvent } from "@dnd-kit/core";
import { DndContext, useSensor, PointerSensor } from "@dnd-kit/core";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback, useEffect, useState } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import CollapseSection from "metabase/components/CollapseSection";
import { Sortable } from "metabase/core/components/Sortable";
import Tooltip from "metabase/core/components/Tooltip";
import GrabberS from "metabase/css/components/grabber.module.css";
import CS from "metabase/css/core/index.css";
import Bookmarks from "metabase/entities/bookmarks";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { Icon } from "metabase/ui";
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

const BookmarkItem = ({
  bookmark,
  isSorting,
  selectedItem,
  onSelect,
  onDeleteBookmark,
}: BookmarkItemProps) => {
  const isSelected = isBookmarkSelected(bookmark, selectedItem);
  const url = Urls.bookmark(bookmark);
  const icon = Bookmarks.objectSelectors.getIcon(bookmark);
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
        hasDefaultIconStyle={!isIrregularCollection}
        onClick={onSelect}
        right={
          <button onClick={onRemove}>
            <Tooltip tooltip={t`Remove bookmark`} placement="bottom">
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
      const newIndex = bookmarks.findIndex(b => b.id === input.over?.id);
      const oldIndex = bookmarks.findIndex(b => b.id === input.active.id);
      await reorderBookmarks({ newIndex, oldIndex });
    },
    [reorderBookmarks, bookmarks],
  );

  const bookmarkIds = bookmarks.map(b => b.id);

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
