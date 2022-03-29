import React, { useCallback, useState } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import CollapseSection from "metabase/components/CollapseSection";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { Bookmark, BookmarkableEntities } from "metabase-types/api";
import Bookmarks from "metabase/entities/bookmarks";
import * as Urls from "metabase/lib/urls";

import { SelectedItem } from "../types";
import { SidebarHeading } from "../MainNavbar.styled";
import { BookmarkListRoot, SidebarBookmarkItem } from "./BookmarkList.styled";

const mapDispatchToProps = {
  onDeleteBookmark: ({ item_id, type }: Bookmark) =>
    Bookmarks.actions.delete({ id: item_id, type }),
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
  selectedItem: SelectedItem;
  onDeleteBookmark: (bookmark: Bookmark) => void;
}

const BOOKMARKS_INITIALLY_VISIBLE =
  localStorage.getItem("shouldDisplayBookmarks") !== "false";

const BookmarkList = ({
  bookmarks,
  selectedItem,
  onDeleteBookmark,
}: CollectionSidebarBookmarksProps) => {
  const onToggleBookmarks = useCallback(isVisible => {
    localStorage.setItem("shouldDisplayBookmarks", String(isVisible));
  }, []);

  return (
    <CollapseSection
      header={<SidebarHeading>{t`Bookmarks`}</SidebarHeading>}
      initialState={BOOKMARKS_INITIALLY_VISIBLE ? "expanded" : "collapsed"}
      iconPosition="right"
      iconSize={8}
      onToggle={onToggleBookmarks}
    >
      {bookmarks.map(bookmark => {
        const { id, item_id, name, type } = bookmark;
        const isSelected =
          selectedItem.type !== "collection" &&
          selectedItem.type === type &&
          selectedItem.id === item_id;
        const url = Urls.bookmark(bookmark);
        const onRemove = () => onDeleteBookmark(bookmark);
        return (
          <SidebarBookmarkItem
            key={`bookmark-${id}`}
            url={url}
            icon={getIconForEntityType(type)}
            isSelected={isSelected}
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
      })}
    </CollapseSection>
  );
};

export default connect(null, mapDispatchToProps)(BookmarkList);
