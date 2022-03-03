import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import Link from "metabase/collections/components/CollectionSidebar/CollectionSidebarLink";
import { LabelContainer } from "../Collections/CollectionsList/CollectionsList.styled";
import BookmarksRoot, {
  BookmarkLinkRoot,
  BookmarkTypeIcon,
} from "./Bookmarks.styled";

import { SidebarHeading } from "metabase/collections/components/CollectionSidebar/CollectionSidebar.styled";

const LabelPropTypes = {
  itemId: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
};

const BookmarksPropTypes = {
  bookmarks: PropTypes.object,
};

const Label = ({ name }) => {
  return (
    <LabelContainer>
      <BookmarkTypeIcon name="grid" />
      {name}
    </LabelContainer>
  );
};

Label.propTypes = LabelPropTypes;

const CollectionSidebarBookmarks = ({ bookmarks }) => {
  if (bookmarks.length === 0) {
    return null;
  }

  return (
    <BookmarksRoot>
      <SidebarHeading>{t`Bookmarks`}</SidebarHeading>

      <BookmarkLinkRoot>
        {bookmarks.map(({ id, name, type }, index) => {
          const url = Urls.bookmark({ id, name, type });
          return (
            <Link
              key={`bookmark-${id}`}
              to={url}
              selected={false}
              onClick={() => {}}
              role="sidebar-bookmark"
            >
              <Label itemId={id} name={name} />
            </Link>
          );
        })}
      </BookmarkLinkRoot>
    </BookmarksRoot>
  );
};

CollectionSidebarBookmarks.propTypes = BookmarksPropTypes;

export default CollectionSidebarBookmarks;
