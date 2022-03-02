import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import CollectionLink from "metabase/collections/components/CollectionLink";
import {
  CollectionListIcon,
  LabelContainer,
} from "../Collections/CollectionsList/CollectionsList.styled";
import BookmarksRoot from "./Bookmarks.styled";

// import CollectionLink from "metabase/collections/components/CollectionLink";
import { SidebarHeading } from "metabase/components/CollectionSidebar/CollectionSidebar.styled";

const LabelPropTypes = {
  itemId: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
};

const BookmarksPropTypes = {
  bookmarks: PropTypes.object,
};

const Label = ({ itemId, name }) => {
  return (
    <LabelContainer>
      <CollectionListIcon collection={true} targetOffsetX={0} />
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

      {bookmarks.map(({ id, name }, index) => {
        return (
          <CollectionLink
            key={`bookmark-${id}`}
            to={"https://www.google.com"}
            selected={false}
            depth={0}
            onClick={() => {}}
            hovered={false}
            highlighted={false}
            role="sidebar-bookmark"
          >
            <Label itemId={id} name={name} />
          </CollectionLink>
        );
      })}
    </BookmarksRoot>
  );
};

CollectionSidebarBookmarks.propTypes = BookmarksPropTypes;

export default CollectionSidebarBookmarks;
