import React, { useState } from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import Icon from "metabase/components/Icon";
import Link from "metabase/collections/components/CollectionSidebar/CollectionSidebarLink";
import Tooltip from "metabase/components/Tooltip";
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

import { Bookmark, BookmarkableEntities, Bookmarks } from "metabase-types/api";

interface LabelProps {
  bookmark: Bookmark;
}

interface CollectionSidebarBookmarksProps {
  bookmarks: Bookmarks;
  deleteBookmark: (id: string, type: string) => void;
}

const Label = ({ bookmark }: LabelProps) => {
  const icon = BookmarkEntity.objectSelectors.getIcon(bookmark);

  return (
    <LabelContainer>
      <BookmarkTypeIcon
        color={icon.color}
        name={icon.name}
        opacity={icon.opacity}
      />
      {bookmark.name}
    </LabelContainer>
  );
};

const CollectionSidebarBookmarks = ({
  bookmarks,
  deleteBookmark,
}: CollectionSidebarBookmarksProps) => {
  const storedShouldDisplayBookmarks =
    localStorage.getItem("shouldDisplayBookmarks") !== "false";
  const [shouldDisplayBookmarks, setShouldDisplayBookmarks] = useState(
    storedShouldDisplayBookmarks,
  );

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
        <BookmarkListRoot>
          {bookmarks.map((bookmark, index) => {
            const { id, name, type } = bookmark;
            const url = Urls.bookmark({ id, name, type });

            return (
              <BookmarkContainer key={`bookmark-${id}`}>
                <Link to={url}>
                  <Label bookmark={bookmark} />
                </Link>

                <button onClick={() => handleDeleteBookmark(bookmark)}>
                  <Tooltip tooltip={t`Remove bookmark`} placement="bottom">
                    <Icon name="bookmark" />
                  </Tooltip>
                </button>
              </BookmarkContainer>
            );
          })}
        </BookmarkListRoot>
      )}
    </BookmarksRoot>
  );
};

export default CollectionSidebarBookmarks;
