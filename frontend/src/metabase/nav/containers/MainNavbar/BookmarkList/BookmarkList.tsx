import React, { useCallback } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import CollapseSection from "metabase/components/CollapseSection";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import { Bookmark } from "metabase-types/api";
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

  const renderBookmark = useCallback(
    bookmark => {
      const { id, item_id, name, type } = bookmark;
      const isSelected =
        selectedItem &&
        selectedItem.type !== "collection" &&
        selectedItem.type === type &&
        selectedItem.id === item_id;
      const icon = Bookmarks.objectSelectors.getIcon(bookmark);
      const url = Urls.bookmark(bookmark);
      const onRemove = () => onDeleteBookmark(bookmark);
      return (
        <SidebarBookmarkItem
          key={`bookmark-${id}`}
          url={url}
          icon={icon}
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
    },
    [selectedItem, onDeleteBookmark],
  );

  return (
    <CollapseSection
      header={<SidebarHeading>{t`Bookmarks`}</SidebarHeading>}
      initialState={BOOKMARKS_INITIALLY_VISIBLE ? "expanded" : "collapsed"}
      iconPosition="right"
      iconSize={8}
      onToggle={onToggleBookmarks}
    >
      {bookmarks.map(renderBookmark)}
    </CollapseSection>
  );
};

export default connect(null, mapDispatchToProps)(BookmarkList);
