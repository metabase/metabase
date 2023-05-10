import React, { useCallback, useEffect, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import {
  SortableContainer,
  SortableElement,
} from "metabase/components/sortable";
import CollapseSection from "metabase/components/CollapseSection";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";

import { Bookmark } from "metabase-types/api";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import Bookmarks from "metabase/entities/bookmarks";
import * as Urls from "metabase/lib/urls";

import { SelectedItem } from "../../types";
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
  index,
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
    <SortableBookmarkItem index={index} key={bookmark.id}>
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
    </SortableBookmarkItem>
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

  const onToggleBookmarks = useCallback(isVisible => {
    localStorage.setItem("shouldDisplayBookmarks", String(isVisible));
  }, []);

  const handleSortStart = useCallback(() => {
    document.body.classList.add("grabbing");
    setIsSorting(true);
  }, []);

  const handleSortEnd = useCallback(
    ({ newIndex, oldIndex }) => {
      document.body.classList.remove("grabbing");
      setIsSorting(false);
      reorderBookmarks({ newIndex, oldIndex });
    },
    [reorderBookmarks],
  );

  return (
    <CollapseSection
      header={<SidebarHeading>{t`Bookmarks`}</SidebarHeading>}
      initialState={BOOKMARKS_INITIALLY_VISIBLE ? "expanded" : "collapsed"}
      iconPosition="right"
      iconSize={8}
      headerClass="mb1"
      onToggle={onToggleBookmarks}
    >
      <SortableBookmarkList
        distance={9}
        onSortStart={handleSortStart}
        onSortEnd={handleSortEnd}
        lockAxis="y"
        helperClass="sorting"
      >
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
      </SortableBookmarkList>
    </CollapseSection>
  );
};

const List = ({ children }: { children: JSX.Element[] }) => <ul>{children}</ul>;
const Item = ({ children }: { children: JSX.Element }) => <>{children}</>;

const SortableBookmarkItem = SortableElement(Item);
const SortableBookmarkList = SortableContainer(List);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(BookmarkList);
