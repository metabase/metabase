import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Bookmark, Collection, User } from "metabase-types/api";

import { IconProps } from "metabase/components/Icon";
import { Tree } from "metabase/components/tree";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

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
  CollectionMenuList,
  CollectionsMoreIcon,
  CollectionsMoreIconContainer,
  HomePageLink,
  SidebarContentRoot,
  SidebarHeading,
  SidebarHeadingWrapper,
  SidebarButtonContainer,
  SidebarSection,
} from "./MainNavbar.styled";
import SidebarButton from "../../components/SidebarButton/SidebarButton";
import Tooltip from "metabase/components/Tooltip";
import { isMac } from "metabase/lib/browser";

interface CollectionTreeItem extends Collection {
  icon: string | IconProps;
  children: CollectionTreeItem[];
}

type Props = {
  isAdmin: boolean;
  isOpen: boolean;
  currentUser: User;
  bookmarks: Bookmark[];
  hasDataAccess: boolean;
  hasOwnDatabase: boolean;
  collections: CollectionTreeItem[];
  selectedItems: SelectedItem[];
  openNavbar?: () => void;
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
  isAdmin,
  currentUser,
  bookmarks,
  collections,
  hasOwnDatabase,
  selectedItems,
  hasDataAccess,
  isOpen,
  reorderBookmarks,
  handleCreateNewCollection,
  handleCloseNavbar,
}: Props) {
  const {
    card: cardItem,
    collection: collectionItem,
    dashboard: dashboardItem,
    "non-entity": nonEntityItem,
  } = _.indexBy(selectedItems, item => item.type);

  const onItemSelect = useCallback(() => {
    if (isSmallScreen()) {
      handleCloseNavbar();
    }
  }, [handleCloseNavbar]);

  const sidebarButtonTooltip = useMemo(() => {
    const message = isOpen ? t`Close sidebar` : t`Open sidebar`;
    const shortcut = isMac() ? "(⌘ + .)" : "(Ctrl + .)";
    return `${message} ${shortcut}`;
  }, [isOpen]);

  return (
    <SidebarContentRoot>
      <div>
        <SidebarSection>
          <ul>
            <HomePageLink
              isSelected={nonEntityItem?.url === "/"}
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
              selectedItem={cardItem ?? dashboardItem ?? collectionItem}
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
            selectedId={collectionItem?.id}
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
                isSelected={nonEntityItem?.url?.startsWith(BROWSE_URL)}
                onClick={onItemSelect}
                data-metabase-event="NavBar;Data Browse"
              >
                {t`Browse data`}
              </BrowseLink>
              {!hasOwnDatabase && isAdmin && (
                <AddYourOwnDataLink
                  icon="add"
                  url={ADD_YOUR_OWN_DATA_URL}
                  isSelected={nonEntityItem?.url?.startsWith(
                    ADD_YOUR_OWN_DATA_URL,
                  )}
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
        <SidebarButtonContainer isOpen={isOpen}>
          <Tooltip tooltip={sidebarButtonTooltip} isEnabled={!isSmallScreen()}>
            <SidebarButton isSidebarOpen={isOpen} onClick={handleCloseNavbar} />
          </Tooltip>
        </SidebarButtonContainer>
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
