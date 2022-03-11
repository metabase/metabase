import React from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import Icon from "metabase/components/Icon";
import Link from "metabase/collections/components/CollectionSidebar/CollectionSidebarLink";
import { LabelContainer } from "../Collections/CollectionsList/CollectionsList.styled";
import BookmarksRoot, {
  BookmarkButtonWrapper,
  BookmarkContainer,
  BookmarkListRoot,
  BookmarkTypeIcon,
} from "./Bookmarks.styled";

import { SidebarHeading } from "metabase/collections/components/CollectionSidebar/CollectionSidebar.styled";

import { Bookmark, BookmarkableEntities, Bookmarks } from "metabase-types/api";

interface LabelProps {
  name: string;
  type: BookmarkableEntities;
}

interface CollectionSidebarBookmarksProps {
  bookmarks: Bookmarks;
  deleteBookmark: (arg0: string) => void;
}

function getIconForEntityType(type: BookmarkableEntities) {
  const icons = {
    card: "grid",
    collection: "folder",
    dashboard: "dashboard",
  };

  return icons[type];
}

const Label = ({ name, type }: LabelProps) => {
  const iconName = getIconForEntityType(type);
  return (
    <LabelContainer>
      <BookmarkTypeIcon name={iconName} />
      {name}
    </LabelContainer>
  );
};

const CollectionSidebarBookmarks = ({
  bookmarks,
  deleteBookmark,
}: CollectionSidebarBookmarksProps) => {
  if (bookmarks.length === 0) {
    return null;
  }

  const handleDeleteBookmark = ({ id }: Bookmark) => {
    deleteBookmark(id);
  };

  return (
    <BookmarksRoot>
      <SidebarHeading>{t`Bookmarks`}</SidebarHeading>

      <BookmarkListRoot>
        {bookmarks.map((bookmark, index) => {
          const { id, name, type } = bookmark;
          const url = Urls.bookmark({ id, name, type });
          return (
            <BookmarkContainer key={`bookmark-${id}`}>
              <Link to={url}>
                <Label name={name} type={type} />
              </Link>
              <BookmarkButtonWrapper
                onClick={() => handleDeleteBookmark(bookmark)}
              >
                <Icon name="bookmark" />
              </BookmarkButtonWrapper>
            </BookmarkContainer>
          );
        })}
      </BookmarkListRoot>
    </BookmarksRoot>
  );
};

export default CollectionSidebarBookmarks;
