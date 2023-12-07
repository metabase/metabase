import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { IconName, IconProps } from "metabase/core/components/Icon";
import { Tree } from "metabase/components/tree";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import {
  getCollectionIcon,
  PERSONAL_COLLECTIONS,
} from "metabase/entities/collections";
import { isSmallScreen } from "metabase/lib/dom";
import * as Urls from "metabase/lib/urls";

import type { Bookmark, Collection, User } from "metabase-types/api";

import { WhatsNewNotification } from "metabase/nav/components/WhatsNewNotification";
import type { SelectedItem } from "../types";
import { SidebarCollectionLink, SidebarLink } from "../SidebarItems";

import {
  AddYourOwnDataLink,
  CollectionMenuList,
  CollectionsMoreIcon,
  CollectionsMoreIconContainer,
  PaddedSidebarLink,
  SidebarContentRoot,
  SidebarHeading,
  SidebarHeadingWrapper,
  SidebarSection,
} from "../MainNavbar.styled";

import BookmarkList from "./BookmarkList";

interface CollectionTreeItem extends Collection {
  icon: IconName | IconProps;
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

  return (
    <SidebarContentRoot>
      <div>
        <SidebarSection>
          <ul>
            <PaddedSidebarLink
              isSelected={nonEntityItem?.url === "/"}
              icon="home"
              onClick={onItemSelect}
              url="/"
            >
              {t`Home`}
            </PaddedSidebarLink>
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
            aria-label="collection-tree"
          />
        </SidebarSection>

        {hasDataAccess && (
          <SidebarSection>
            <SidebarHeadingWrapper>
              <SidebarHeading>{t`Data`}</SidebarHeading>
            </SidebarHeadingWrapper>
            <ul>
              <PaddedSidebarLink
                icon="database"
                url={BROWSE_URL}
                isSelected={nonEntityItem?.url?.startsWith(BROWSE_URL)}
                onClick={onItemSelect}
                data-metabase-event="NavBar;Data Browse"
              >
                {t`Browse data`}
              </PaddedSidebarLink>
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
            </ul>
          </SidebarSection>
        )}
      </div>
      <WhatsNewNotification />
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
            icon={
              getCollectionIcon(
                PERSONAL_COLLECTIONS as Collection,
              ) as unknown as IconName
            }
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
            <CollectionsMoreIcon name="ellipsis" onClick={onClick} />
          )}
          popoverContent={renderMenu}
        />
      </CollectionsMoreIconContainer>
    </SidebarHeadingWrapper>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MainNavbarView;
