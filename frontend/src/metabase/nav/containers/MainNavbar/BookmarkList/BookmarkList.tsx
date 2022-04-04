import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import CollapseSection from "metabase/components/CollapseSection";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import {
  SortableContainer,
  SortableElement,
  SortableHandle,
} from "metabase/components/sortable";

import { Bookmark } from "metabase-types/api";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import Bookmarks from "metabase/entities/bookmarks";
import * as Urls from "metabase/lib/urls";

import { SelectedEntityItem } from "../types";
import { SidebarHeading } from "../MainNavbar.styled";
import { SidebarBookmarkItem } from "./BookmarkList.styled";

const mapDispatchToProps = {
  onDeleteBookmark: ({ item_id, type }: Bookmark) =>
    Bookmarks.actions.delete({ id: item_id, type }),
};

interface CollectionSidebarBookmarksProps {
  bookmarks: Bookmark[];
  selectedItem?: SelectedEntityItem;
  onSelect: () => void;
  onDeleteBookmark: (bookmark: Bookmark) => void;
}

const BOOKMARKS_INITIALLY_VISIBLE =
  localStorage.getItem("shouldDisplayBookmarks") !== "false";

const BookmarkItem = ({
  bookmark,
  selectedItem,
  onDeleteBookmark,
  onSelect,
  isSorting,
}) => {
  const { id, item_id, name, type } = bookmark;
  const isSelected =
    selectedItem &&
    selectedItem.type !== "collection" &&
    selectedItem.type === type &&
    selectedItem.id === item_id;
  const url = Urls.bookmark(bookmark);
  const icon = Bookmarks.objectSelectors.getIcon(bookmark);
  const onRemove = () => onDeleteBookmark(bookmark);

  const isIrregularCollection =
    bookmark.type === "collection" &&
    !PLUGIN_COLLECTIONS.isRegularCollection(bookmark);

  return (
    <SidebarBookmarkItem
      key={`bookmark-${id}`}
      url={url}
      icon={icon}
      isSelected={isSelected}
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
      {name}
    </SidebarBookmarkItem>
  );
};

const BookmarkList = ({
  bookmarks,
  selectedItem,
  onSelect,
  onDeleteBookmark,
}: CollectionSidebarBookmarksProps) => {
  const [orderedBookmarks, setOrderedBookmarks] = useState(bookmarks);
  const [isSorting, setIsSorting] = useState(false);
  const onToggleBookmarks = useCallback(isVisible => {
    localStorage.setItem("shouldDisplayBookmarks", String(isVisible));
  }, []);

  const handleSortStart = () => {
    setIsSorting(true);
  };

  const handleSortEnd = ({
    newIndex,
    oldIndex,
  }: {
    newIndex: number;
    oldIndex: number;
  }) => {
    setIsSorting(false);

    const bookmarksToBeReordered = [...orderedBookmarks];
    const element = orderedBookmarks[oldIndex];

    bookmarksToBeReordered.splice(oldIndex, 1);
    bookmarksToBeReordered.splice(newIndex, 0, element);

    setOrderedBookmarks(bookmarksToBeReordered);
  };

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
        onSortStart={handleSortStart}
        onSortEnd={handleSortEnd}
        lockAxis="y"
        pressDelay={200}
        helperClass="sorting"
      >
        {orderedBookmarks.map((bookmark, index) => (
          <SortableBookmarkItem
            index={index}
            key={bookmark.id}
            bookmark={bookmark}
            onDeleteBookmark={onDeleteBookmark}
            isSorting={isSorting}
          />
        ))}
      </SortableBookmarkList>
    </CollapseSection>
  );
};

const SortableBookmarkListContainer = ({
  children,
}: {
  children: JSX.Element;
}) => <ul>{children}</ul>;

const SortableBookmarkList = SortableContainer(SortableBookmarkListContainer);
const SortableBookmarkItem = SortableElement(BookmarkItem);

export default connect(null, mapDispatchToProps)(BookmarkList);
