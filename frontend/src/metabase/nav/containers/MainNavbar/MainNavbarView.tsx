import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Bookmark, Collection, User } from "metabase-types/api";

import { IconProps } from "metabase/components/Icon";
import { Tree } from "metabase/components/tree";
import { TreeNodeProps } from "metabase/components/tree/types";

import ProfileLink from "metabase/nav/components/ProfileLink";

import {
  getCollectionIcon,
  PERSONAL_COLLECTIONS,
} from "metabase/entities/collections";
import { IFRAMED, isSmallScreen } from "metabase/lib/dom";
import * as Urls from "metabase/lib/urls";

import { SelectedItem } from "./types";
import BookmarkList from "./BookmarkList";
import { SidebarCollectionLink, SidebarLink } from "./SidebarItems";
import { SidebarHeading, ProfileLinkContainer } from "./MainNavbar.styled";

interface CollectionTreeItem extends Collection {
  icon: string | IconProps;
  children: CollectionTreeItem[];
}

type Props = {
  currentUser: User;
  bookmarks: Bookmark[];
  collections: CollectionTreeItem[];
  selectedItem: SelectedItem;
  hasDataAccess: boolean;
  handleCloseNavbar: () => void;
};

const BROWSE_URL = "/browse";
const OTHER_USERS_COLLECTIONS_URL = Urls.collection({ id: "users" });
const ARCHIVE_URL = "/archive";

function MainNavbarView({
  currentUser,
  bookmarks,
  collections,
  selectedItem,
  hasDataAccess,
  handleCloseNavbar,
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

  const onItemSelect = useCallback(() => {
    if (isSmallScreen()) {
      handleCloseNavbar();
    }
  }, [handleCloseNavbar]);

  return (
    <>
      {bookmarks.length > 0 && (
        <>
          <BookmarkList
            bookmarks={bookmarks}
            selectedItem={
              selectedItem.type !== "unknown" ? selectedItem : undefined
            }
            onSelect={onItemSelect}
          />
          <SidebarHeading>{t`Collections`}</SidebarHeading>
        </>
      )}
      <Tree
        data={collections}
        selectedId={isCollectionSelected ? selectedItem.id : undefined}
        onSelect={onItemSelect}
        TreeNode={CollectionLink}
        role="tree"
      />
      <ul>
        {hasDataAccess && !IFRAMED && (
          <SidebarLink
            icon="table_spaced"
            url={BROWSE_URL}
            isSelected={
              isMiscLinkSelected && selectedItem.url.startsWith(BROWSE_URL)
            }
            onClick={onItemSelect}
            data-metabase-event="NavBar;Data Browse"
          >
            {t`Browse data`}
          </SidebarLink>
        )}
        {currentUser.is_superuser && (
          <SidebarLink
            icon={getCollectionIcon(PERSONAL_COLLECTIONS)}
            url={OTHER_USERS_COLLECTIONS_URL}
            isSelected={
              selectedItem.type === "collection" && selectedItem.id === "users"
            }
            onClick={onItemSelect}
          >
            {t`Other users' personal collections`}
          </SidebarLink>
        )}
        <SidebarLink
          icon="view_archive"
          url={ARCHIVE_URL}
          isSelected={
            isMiscLinkSelected && selectedItem.url.startsWith(ARCHIVE_URL)
          }
          onClick={onItemSelect}
        >
          {t`View archive`}
        </SidebarLink>
      </ul>
      {!IFRAMED && (
        <ProfileLinkContainer>
          <ProfileLink user={currentUser} handleCloseNavbar={onItemSelect} />
        </ProfileLinkContainer>
      )}
    </>
  );
}

export default MainNavbarView;
