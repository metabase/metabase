import React, { useState } from "react";
import Draggable from "react-draggable";
import { t } from "ttag";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import {
  SortableContainer,
  SortableElement,
  SortableHandle,
} from "metabase/components/sortable";
import Icon from "metabase/components/Icon";
import Link from "metabase/collections/components/CollectionSidebar/CollectionSidebarLink";
import BookmarkEntity from "metabase/entities/bookmarks";
import { LabelContainer } from "../Collections/CollectionsList/CollectionsList.styled";
import BookmarksRoot, {
  BookmarkContainer,
  BookmarkListRoot,
  BookmarkTypeIcon,
} from "./Bookmarks.styled";

import {
  SidebarHeading,
  ToggleListDisplayButton,
} from "metabase/collections/components/CollectionSidebar/CollectionSidebar.styled";

import { Bookmark, Bookmarks } from "metabase-types/api";

interface BookmarkProps {
  bookmark: Bookmark;
}

interface CollectionSidebarBookmarksProps {
  bookmarks: Bookmarks;
  deleteBookmark: (id: string, type: string) => void;
}

interface IconProps {
  name: string;
  tooltip?: string;
  isOfficial?: boolean;
}

const BookmarkIcon = ({ bookmark }: BookmarkProps) => {
  const icon = BookmarkEntity.objectSelectors.getIcon(bookmark);
  const isCollection = bookmark.type === "collection";
  const isRegularCollection =
    isCollection && PLUGIN_COLLECTIONS.isRegularCollection(bookmark);
  const isOfficial = isCollection && !isRegularCollection;

  const iconColor = isOfficial ? color("warning") : color("brand");

  return <BookmarkTypeIcon {...icon} color={iconColor} />;
};

const Label = ({ bookmark }: BookmarkProps) => {
  const icon = BookmarkEntity.objectSelectors.getIcon(bookmark);

  return (
    <LabelContainer>
      <BookmarkIcon bookmark={bookmark} />
      {bookmark.name}
    </LabelContainer>
  );
};

const ListOfBookmarks = ({ children }: { children: JSX.Element }) => (
  <BookmarkListRoot>{children}</BookmarkListRoot>
);

type BookmarkItemProps = {
  bookmark: Bookmark;
  handleDeleteBookmark: (arg0: Bookmark) => void;
};

const BookmarkItem = ({
  bookmark,
  handleDeleteBookmark,
}: BookmarkItemProps) => {
  const { id, name, type } = bookmark;
  const url = Urls.bookmark({ id, name, type });

  return (
    <BookmarkContainer>
      <Link to={url}>
        <Label name={name} type={type} />
      </Link>

      <button onClick={() => handleDeleteBookmark(bookmark)}>
        <Tooltip tooltip={t`Remove bookmark`} placement="bottom">
          <Icon name="bookmark" />
        </Tooltip>
      </button>
    </BookmarkContainer>
  );
};

const SortableBookmarkItem = SortableElement(BookmarkItem);
const SortableListOfBookmark = SortableContainer(ListOfBookmarks);

const CollectionSidebarBookmarks = ({
  bookmarks,
  deleteBookmark,
}: CollectionSidebarBookmarksProps) => {
  const storedShouldDisplayBookmarks =
    localStorage.getItem("shouldDisplayBookmarks") !== "false";
  const [shouldDisplayBookmarks, setShouldDisplayBookmarks] = useState(
    storedShouldDisplayBookmarks,
  );

  const [orderedBookmarks, setOrderedBookmarks] = useState(bookmarks);

  if (bookmarks.length === 0) {
    return null;
  }

  const handleDeleteBookmark = ({ item_id: id, type }: Bookmark) => {
    deleteBookmark(id.toString(), type);
  };

  const toggleBookmarkListVisibility = () => {
    const booleanForLocalStorage = (!shouldDisplayBookmarks).toString();
    localStorage.setItem("shouldDisplayBookmarks", booleanForLocalStorage);

    setShouldDisplayBookmarks(!shouldDisplayBookmarks);
  };

  const handleSortEnd = ({
    newIndex,
    oldIndex,
  }: {
    newIndex: number;
    oldIndex: number;
  }) => {
    const bookmarksToBeReordered = [...orderedBookmarks];
    const element = orderedBookmarks[oldIndex];

    bookmarksToBeReordered.splice(oldIndex, 1);
    bookmarksToBeReordered.splice(newIndex, 0, element);

    setOrderedBookmarks(bookmarksToBeReordered);
  };

  return (
    <BookmarksRoot>
      <SidebarHeading onClick={toggleBookmarkListVisibility}>
        {t`Bookmarks`}{" "}
        <ToggleListDisplayButton
          name="play"
          shouldDisplayBookmarks={shouldDisplayBookmarks}
          size="8"
        />
      </SidebarHeading>

      {shouldDisplayBookmarks && (
        <SortableListOfBookmark
          onSortEnd={handleSortEnd}
          lockAxis="y"
          helperClass=""
        >
          {orderedBookmarks.map((bookmark, index) => {
            return (
              <SortableBookmarkItem
                index={index}
                key={bookmark.id}
                bookmark={bookmark}
                handleDeleteBookmark={handleDeleteBookmark}
              />
            );
          })}
        </SortableListOfBookmark>
      )}
    </BookmarksRoot>
  );
};

export default CollectionSidebarBookmarks;
