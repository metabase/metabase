import React from "react";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import Icon from "metabase/components/Icon";
import Link from "metabase/collections/components/CollectionSidebar/CollectionSidebarLink";
import Tooltip from "metabase/components/Tooltip";
import { LabelContainer } from "../Collections/CollectionsList/CollectionsList.styled";
import BookmarksRoot, {
  BookmarkContainer,
  BookmarkListRoot,
  BookmarkTypeIcon,
} from "./Bookmarks.styled";

import { SidebarHeading } from "metabase/collections/components/CollectionSidebar/CollectionSidebar.styled";

import { Bookmark, BookmarkableEntities, Bookmarks } from "metabase-types/api";

interface LabelProps {
  name: string;
  display: string;
  type: BookmarkableEntities;
}

interface CollectionSidebarBookmarksProps {
  bookmarks: Bookmarks;
  deleteBookmark: (id: string, type: string) => void;
}

function getIcon(display: string, type: BookmarkableEntities) {
  if (display) {
    return display;
  }

  const icons = {
    card: "grid",
    collection: "folder",
    dashboard: "dashboard",
  };

  return icons[type];
}

const Label = ({ display, name, type }: LabelProps) => {
  const iconName = getIcon(display, type);
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

  const handleDeleteBookmark = ({ item_id: id, type }: Bookmark) => {
    deleteBookmark(id.toString(), type);
  };

  return (
    <BookmarksRoot>
      <SidebarHeading>{t`Bookmarks`}</SidebarHeading>

      <BookmarkListRoot>
        {bookmarks.map((bookmark, index) => {
          const { id, name, type, display } = bookmark;
          const url = Urls.bookmark({ id, name, type });
          return (
            <BookmarkContainer key={`bookmark-${id}`}>
              <Link to={url}>
                <Label name={name} type={type} display={display} />
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
    </BookmarksRoot>
  );
};

export default CollectionSidebarBookmarks;
