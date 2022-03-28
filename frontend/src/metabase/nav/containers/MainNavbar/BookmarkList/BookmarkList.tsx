import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { Bookmark, BookmarkableEntities } from "metabase-types/api";
import Bookmarks from "metabase/entities/bookmarks";
import * as Urls from "metabase/lib/urls";

import { SidebarLink } from "../SidebarItems";
import { BookmarkListRoot } from "./BookmarkList.styled";

const mapDispatchToProps = {
  onDeleteBookmark: ({ id, type }: Bookmark) =>
    Bookmarks.actions.delete({ id: id.toString(), type }),
};

function getIconForEntityType(type: BookmarkableEntities) {
  const icons = {
    card: "grid",
    collection: "folder",
    dashboard: "dashboard",
  };
  return icons[type];
}

interface CollectionSidebarBookmarksProps {
  bookmarks: Bookmark[];
  currentPathname: string;
  onDeleteBookmark: (bookmark: Bookmark) => void;
}

const BookmarkList = ({
  bookmarks,
  currentPathname,
  onDeleteBookmark,
}: CollectionSidebarBookmarksProps) => {
  return (
    <BookmarkListRoot>
      {bookmarks.map(bookmark => {
        const { id, name, type } = bookmark;
        const url = Urls.bookmark(bookmark);
        const onRemove = () => onDeleteBookmark(bookmark);
        return (
          <SidebarLink
            key={`bookmark-${id}`}
            url={url}
            icon={getIconForEntityType(type)}
            isSelected={currentPathname.startsWith(url)}
            right={
              <button onClick={onRemove}>
                <Tooltip tooltip={t`Remove bookmark`} placement="bottom">
                  <Icon name="bookmark" />
                </Tooltip>
              </button>
            }
          >
            {name}
          </SidebarLink>
        );
      })}
    </BookmarkListRoot>
  );
};

export default connect(null, mapDispatchToProps)(BookmarkList);
