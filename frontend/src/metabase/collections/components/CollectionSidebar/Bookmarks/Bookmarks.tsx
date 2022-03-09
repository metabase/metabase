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

import { Bookmarks } from "metabase-types/api";

const LabelPropTypes = {
  name: PropTypes.string.isRequired,
};

const BookmarksPropTypes = {
  bookmarks: PropTypes.object,
};

interface LabelProps {
  name: string;
}

const Label = ({ name }: LabelProps) => {
  return (
    <LabelContainer>
      <BookmarkTypeIcon name="grid" />
      {name}
    </LabelContainer>
  );
};

Label.propTypes = LabelPropTypes;

interface CollectionSidebarBookmarksProps {
  bookmarks: Bookmarks;
}
const CollectionSidebarBookmarks = ({
  bookmarks,
}: CollectionSidebarBookmarksProps) => {
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
            <Link key={`bookmark-${id}`} to={url}>
              <Label name={name} />
            </Link>
          );
        })}
      </BookmarkLinkRoot>
    </BookmarksRoot>
  );
};

CollectionSidebarBookmarks.propTypes = BookmarksPropTypes;

export default CollectionSidebarBookmarks;
