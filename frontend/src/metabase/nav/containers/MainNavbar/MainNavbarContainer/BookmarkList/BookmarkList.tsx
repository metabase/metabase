import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import { DndContext, useSensor, PointerSensor } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";

import { Sortable } from "metabase/core/components/Sortable";

import CollapseSection from "metabase/components/CollapseSection";
import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";

import type { Bookmark } from "metabase-types/api";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import Bookmarks from "metabase/entities/bookmarks";
import * as Urls from "metabase/lib/urls";

import type { SelectedItem } from "../../types";
import { SidebarHeading } from "../../MainNavbar.styled";

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
  }) => void;
}

interface BookmarkItemProps {
  bookmark: Bookmark;
  index: number;
  isSorting: boolean;
  selectedItem?: SelectedItem;
  onSelect: () => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
}

const BOOKMARKS_INITIALLY_VISIBLE =
  localStorage.getItem("shouldDisplayBookmarks") !== "false";

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
              <Icon name="bookmark" />
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
}: CollectionSidebarBookmarksProps) => {
  const [orderedBookmarks, setOrderedBookmarks] = useState(bookmarks);
  const [isSorting, setIsSorting] = useState(false);

  useEffect(() => {
    setOrderedBookmarks(bookmarks);
  }, [bookmarks]);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 0 },
  });

  const onToggleBookmarks = useCallback(isVisible => {
    localStorage.setItem("shouldDisplayBookmarks", String(isVisible));
  }, []);

  const handleSortStart = useCallback(() => {
    document.body.classList.add("grabbing");
    setIsSorting(true);
  }, []);

  const handleSortEnd = useCallback(
    input => {
      document.body.classList.remove("grabbing");
      setIsSorting(false);
      const newIndex = bookmarks.findIndex(b => b.id === input.over.id);
      const oldIndex = bookmarks.findIndex(b => b.id === input.active.id);
      reorderBookmarks({ newIndex, oldIndex });
    },
    [reorderBookmarks, bookmarks],
  );

  const bookmarkIds = bookmarks.map(b => b.id);

  return (
    <CollapseSection
      header={<SidebarHeading>{t`Bookmarks`}</SidebarHeading>}
      initialState={BOOKMARKS_INITIALLY_VISIBLE ? "expanded" : "collapsed"}
      iconPosition="right"
      iconSize={8}
      headerClass="mb1"
      onToggle={onToggleBookmarks}
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
