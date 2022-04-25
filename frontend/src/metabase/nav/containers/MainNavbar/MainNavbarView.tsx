import React, { useCallback } from "react";
import { t } from "ttag";

import { BookmarksType, Collection, User } from "metabase-types/api";

import Link from "metabase/core/components/Link";
import { IconProps } from "metabase/components/Icon";
import { Tree } from "metabase/components/tree";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

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
import {
  AddYourOwnDataLink,
  BrowseLink,
  CollectionsMoreIconContainer,
  CollectionsMoreIcon,
  CollectionMenuList,
  HomePageLink,
  ProfileLinkContainer,
  SidebarContentRoot,
  SidebarHeading,
  SidebarSection,
  SidebarHeadingWrapper,
} from "./MainNavbar.styled";

interface CollectionTreeItem extends Collection {
  icon: string | IconProps;
  children: CollectionTreeItem[];
}

type Props = {
  isOpen: boolean;
  currentUser: User;
  bookmarks: BookmarksType;
  hasDataAccess: boolean;
  hasOwnDatabase: boolean;
  collections: CollectionTreeItem[];
  selectedItem: SelectedItem;
  handleCloseNavbar: () => void;
  handleLogout: () => void;
  handleCreateNewCollection: () => void;
  reorderBookmarks: ({
    newIndex,
    oldIndex,
  }: {
    newIndex: number;
    oldIndex: number;
  }) => void;
};

const BROWSE_URL = "/browse";
const OTHER_USERS_COLLECTIONS_URL = Urls.otherUsersPersonalCollections();
const ARCHIVE_URL = "/archive";
const ADD_YOUR_OWN_DATA_URL = "/admin/databases/create";

function MainNavbarView({
  isOpen,
  currentUser,
  bookmarks,
  collections,
  hasOwnDatabase,
  selectedItem,
  hasDataAccess,
  reorderBookmarks,
  handleCreateNewCollection,
  handleCloseNavbar,
  handleLogout,
}: Props) {
  const isNonEntityLinkSelected = selectedItem.type === "non-entity";
  const isCollectionSelected =
    selectedItem.type === "collection" && selectedItem.id !== "users";

  const onItemSelect = useCallback(() => {
    if (isSmallScreen()) {
      handleCloseNavbar();
    }
  }, [handleCloseNavbar]);

  return (
    <SidebarContentRoot>
      <div>
        <SidebarSection>
          <ul>
            <HomePageLink
              isSelected={isNonEntityLinkSelected && selectedItem.url === "/"}
              icon="home"
              onClick={onItemSelect}
              url="/"
            >
              {t`Home`}
            </HomePageLink>
          </ul>
        </SidebarSection>

        {bookmarks.length > 0 && (
          <SidebarSection>
            <BookmarkList
              bookmarks={bookmarks}
              selectedItem={
                selectedItem.type !== "non-entity" ? selectedItem : undefined
              }
              onSelect={onItemSelect}
              reorderBookmarks={reorderBookmarks}
            />
          </SidebarSection>
        )}

        <SidebarSection>
          <CollectionSectionHeading
            currentUser={currentUser}
            handleCreateNewCollection={handleCreateNewCollection}
          />
          <Tree
            data={collections}
            selectedId={isCollectionSelected ? selectedItem.id : undefined}
            onSelect={onItemSelect}
            TreeNode={SidebarCollectionLink}
            role="tree"
          />
        </SidebarSection>
        <ul>
          {hasDataAccess && !IFRAMED && (
            <SidebarSection>
              <SidebarHeadingWrapper>
                <SidebarHeading>{t`Data`}</SidebarHeading>
              </SidebarHeadingWrapper>
              <BrowseLink
                icon="database"
                url={BROWSE_URL}
                isSelected={
                  isNonEntityLinkSelected &&
                  selectedItem.url.startsWith(BROWSE_URL)
                }
                onClick={onItemSelect}
                data-metabase-event="NavBar;Data Browse"
              >
                {t`Browse data`}
              </BrowseLink>
              {!hasOwnDatabase && (
                <AddYourOwnDataLink
                  icon="add"
                  url={ADD_YOUR_OWN_DATA_URL}
                  isSelected={
                    isNonEntityLinkSelected &&
                    selectedItem.url.startsWith(ADD_YOUR_OWN_DATA_URL)
                  }
                  onClick={onItemSelect}
                  data-metabase-event="NavBar;Add your own data"
                >
                  {t`Add your own data`}
                </AddYourOwnDataLink>
              )}
            </SidebarSection>
          )}
        </ul>
      </div>
      {!IFRAMED && (
        <ProfileLinkContainer isOpen={isOpen}>
          <ProfileLink
            user={currentUser}
            handleCloseNavbar={onItemSelect}
            handleLogout={handleLogout}
          />
        </ProfileLinkContainer>
      )}
    </SidebarContentRoot>
  );
}

interface CollectionSectionHeadingProps {
  currentUser: User;
  handleCreateNewCollection: () => void;
}

function CollectionSectionHeading({
  currentUser,
  handleCreateNewCollection,
}: CollectionSectionHeadingProps) {
  const renderMenu = useCallback(
    ({ closePopover }) => (
      <CollectionMenuList>
        <SidebarLink
          icon="add"
          onClick={() => {
            closePopover();
            handleCreateNewCollection();
          }}
        >
          {t`New collection`}
        </SidebarLink>
        {currentUser.is_superuser && (
          <SidebarLink
            icon={getCollectionIcon(PERSONAL_COLLECTIONS)}
            url={OTHER_USERS_COLLECTIONS_URL}
            onClick={closePopover}
          >
            {t`Other users' personal collections`}
          </SidebarLink>
        )}
        <SidebarLink
          icon="view_archive"
          url={ARCHIVE_URL}
          onClick={closePopover}
        >
          {t`View archive`}
        </SidebarLink>
      </CollectionMenuList>
    ),
    [currentUser, handleCreateNewCollection],
  );

  return (
    <SidebarHeadingWrapper>
      <SidebarHeading>{t`Collections`}</SidebarHeading>
      <CollectionsMoreIconContainer>
        <TippyPopoverWithTrigger
          renderTrigger={({ onClick }) => (
            <CollectionsMoreIcon name="ellipsis" onClick={onClick} size={12} />
          )}
          popoverContent={renderMenu}
        />
      </CollectionsMoreIconContainer>
    </SidebarHeadingWrapper>
  );
}

export default MainNavbarView;
