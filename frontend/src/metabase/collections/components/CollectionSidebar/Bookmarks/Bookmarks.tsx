import React, { useState } from "react";
import { t } from "ttag";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

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

import { Bookmark, BookmarkableEntities, Bookmarks } from "metabase-types/api";

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
                  <Icon name="bookmark" />
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
