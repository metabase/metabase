import React, { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Bookmark, Collection, User } from "metabase-types/api";

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
  bookmarks: Bookmark[];
  hasDataAccess: boolean;
  hasOwnDatabase: boolean;
  collections: CollectionTreeItem[];
  selectedItem: SelectedItem;
  handleCloseNavbar: () => void;
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
  handleCloseNavbar,
}: Props) {
  const isMiscLinkSelected = selectedItem.type === "unknown";
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
        {bookmarks.length > 0 && (
          <SidebarSection>
            <BookmarkList
              bookmarks={bookmarks}
              selectedItem={
                selectedItem.type !== "unknown" ? selectedItem : undefined
              }
              onSelect={onItemSelect}
            />
          </SidebarSection>
        )}
        <SidebarSection>
          <CollectionSectionHeading currentUser={currentUser} />
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
                  isMiscLinkSelected && selectedItem.url.startsWith(BROWSE_URL)
                }
                onClick={onItemSelect}
                data-metabase-event="NavBar;Data Browse"
              >
                {t`Browse data`}
              </BrowseLink>
              {!hasOwnDatabase && (
                <AddYourOwnDataLink
                  icon="database"
                  url={ADD_YOUR_OWN_DATA_URL}
                  isSelected={
                    isMiscLinkSelected &&
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
          <ProfileLink user={currentUser} handleCloseNavbar={onItemSelect} />
        </ProfileLinkContainer>
      )}
    </SidebarContentRoot>
  );
}

interface CollectionSectionHeadingProps {
  currentUser: User;
}

function CollectionSectionHeading({
  currentUser,
}: CollectionSectionHeadingProps) {
  const renderMenu = useCallback(
    ({ onClose }) => (
      <CollectionMenuList>
        {currentUser.is_superuser && (
          <SidebarLink
            icon={getCollectionIcon(PERSONAL_COLLECTIONS)}
            url={OTHER_USERS_COLLECTIONS_URL}
            onClick={onClose}
          >
            {t`Other users' personal collections`}
          </SidebarLink>
        )}
        <SidebarLink icon="view_archive" url={ARCHIVE_URL} onClick={onClose}>
          {t`View archive`}
        </SidebarLink>
      </CollectionMenuList>
    ),
    [currentUser],
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
