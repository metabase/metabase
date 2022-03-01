import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import CollectionLink from "metabase/collections/components/CollectionLink";
import { SidebarHeading } from "metabase/components/CollectionSidebar/CollectionSidebar.styled";

const propTypes = {
  bookmarks: PropTypes.object,
};

const CollectionSidebarBookmarks = ({ bookmarks }) => {
  if (bookmarks.length === 0) {
    return null;
  }

  return (
    <>
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
            <Label
              action={action}
              collection={collection}
              initialIcon={initialIcon}
              isOpen={isOpen}
              depth={depth}
            />
          </CollectionLink>
        );
      })}
    </>
  );
};

CollectionSidebarBookmarks.propTypes = propTypes;

export default CollectionSidebarBookmarks;
