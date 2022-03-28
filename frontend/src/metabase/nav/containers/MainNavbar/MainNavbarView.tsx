import React, { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Bookmark, User } from "metabase-types/api";

import { Tree } from "metabase/components/tree";
import { TreeNodeProps } from "metabase/components/tree/types";

import ProfileLink from "metabase/nav/components/ProfileLink";

import * as Urls from "metabase/lib/urls";
import { CollectionTreeItem } from "metabase/collections/utils";

import { SelectedItem } from "./types";
import BookmarkList from "./BookmarkList";
import { SidebarCollectionLink, SidebarLink } from "./SidebarItems";
import { SidebarHeading, ProfileLinkContainer } from "./MainNavbar.styled";

type Props = {
  currentUser: User;
  bookmarks: Bookmark[];
  collections: CollectionTreeItem[];
  selectedItem: SelectedItem;
};

const BROWSE_URL = "/browse";
const OTHER_USERS_COLLECTIONS_URL = Urls.collection({ id: "users" });
const ARCHIVE_URL = "/archive";

function MainNavbarView({
  currentUser,
  bookmarks,
  collections,
  selectedItem,
}: Props) {
  const isMiscLinkSelected = selectedItem.type === "unknown";
  const isCollectionSelected =
    selectedItem.type === "collection" && selectedItem.id !== "users";

  const CollectionLink = useMemo(() => {
    return React.forwardRef<HTMLLIElement, TreeNodeProps>(
      function CollectionLink(props: TreeNodeProps, ref) {
        const { item } = props;
        const url = Urls.collection(item);
        return <SidebarCollectionLink {...props} url={url} ref={ref} />;
      },
    );
  }, []);

  return (
    <>
      {bookmarks.length > 0 && (
        <>
          <SidebarHeading>{t`Bookmarks`}</SidebarHeading>
          <BookmarkList bookmarks={bookmarks} selectedItem={selectedItem} />
          <SidebarHeading>{t`Collections`}</SidebarHeading>
        </>
      )}
      <Tree
        data={collections}
        selectedId={isCollectionSelected ? selectedItem.id : undefined}
        TreeNode={CollectionLink}
      />
      <ul>
        <SidebarLink
          icon="table_spaced"
          url={BROWSE_URL}
          isSelected={
            isMiscLinkSelected && selectedItem.url.startsWith(BROWSE_URL)
          }
          data-metabase-event="NavBar;Data Browse"
        >
          {t`Browse data`}
        </SidebarLink>
        {currentUser.is_superuser && (
          <>
            <SidebarLink
              icon="table_spaced"
              url={OTHER_USERS_COLLECTIONS_URL}
              isSelected={
                selectedItem.type === "collection" &&
                selectedItem.id === "users"
              }
            >
              {t`Other users' personal collections`}
            </SidebarLink>
            <SidebarLink
              icon="view_archive"
              url={ARCHIVE_URL}
              isSelected={
                isMiscLinkSelected && selectedItem.url.startsWith(ARCHIVE_URL)
              }
            >
              {t`View archive`}
            </SidebarLink>
          </>
        )}
      </ul>
      <ProfileLinkContainer>
        <ProfileLink user={currentUser} />
      </ProfileLinkContainer>
    </>
  );
}

export default MainNavbarView;
