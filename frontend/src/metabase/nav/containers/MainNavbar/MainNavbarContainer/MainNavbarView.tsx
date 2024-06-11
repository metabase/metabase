import type { MouseEvent } from "react";
import { useCallback } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useUserSetting } from "metabase/common/hooks";
import { useHomepageDashboard } from "metabase/common/hooks/use-homepage-dashboard";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { Tree } from "metabase/components/tree";
import {
  getCollectionIcon,
  PERSONAL_COLLECTIONS,
} from "metabase/entities/collections";
import { isSmallScreen } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { WhatsNewNotification } from "metabase/nav/components/WhatsNewNotification";
import UploadCSV from "metabase/nav/containers/MainNavbar/SidebarItems/UploadCSV";
import { getSetting } from "metabase/selectors/settings";
import type { IconName, IconProps } from "metabase/ui";
import type { Bookmark, Collection, User } from "metabase-types/api";

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
import { SidebarCollectionLink, SidebarLink } from "../SidebarItems";
import type { SelectedItem } from "../types";

import BookmarkList from "./BookmarkList";
import { BrowseNavSection } from "./BrowseNavSection";

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
const OTHER_USERS_COLLECTIONS_URL = Urls.otherUsersPersonalCollections();
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
  const [expandBookmarks = true, setExpandBookmarks] = useUserSetting(
    "expand-bookmarks-in-nav",
  );

  const { canNavigateHome } = useHomepageDashboard();

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

  const handleHomeClick = useCallback(
    (event: MouseEvent) => {
      // Prevent navigating to the dashboard homepage when a user is already there
      // https://github.com/metabase/metabase/issues/43800
      if (!canNavigateHome) {
        event.preventDefault();
      }
      onItemSelect();
    },
    [canNavigateHome, onItemSelect],
  );

  // TEMP
  // Can upload CSVs if
  // - properties.token_features.attached_dwh === true
  // - retrieve collection using properties.uploads-settings.db_id
  const hasAttachedDWHFeature =
    useSelector(state => getSetting(state, "token-features").attached_dwh) ||
    true; // always visible atm
  const rootCollection = collections.find(
    ({ id, can_write }) => (id === null || id === "root") && can_write,
  );

  return (
    <SidebarContentRoot>
      <div>
        <SidebarSection>
          <PaddedSidebarLink
            isSelected={nonEntityItem?.url === "/"}
            icon="home"
            onClick={handleHomeClick}
            url="/"
          >
            {t`Home`}
          </PaddedSidebarLink>

          {hasAttachedDWHFeature && rootCollection && (
            <UploadCSV collection={rootCollection} />
          )}
        </SidebarSection>
        <SidebarSection>
          <BrowseNavSection
            nonEntityItem={nonEntityItem}
            onItemSelect={onItemSelect}
            hasDataAccess={hasDataAccess}
          />
          {hasDataAccess && (
            <>
              {!hasOwnDatabase && isAdmin && (
                <AddYourOwnDataLink
                  icon="add"
                  url={ADD_YOUR_OWN_DATA_URL}
                  isSelected={nonEntityItem?.url?.startsWith(
                    ADD_YOUR_OWN_DATA_URL,
                  )}
                  onClick={onItemSelect}
                >
                  {t`Add your own data`}
                </AddYourOwnDataLink>
              )}
            </>
          )}
        </SidebarSection>

        {bookmarks.length > 0 && (
          <SidebarSection>
            <BookmarkList
              bookmarks={bookmarks}
              selectedItem={cardItem ?? dashboardItem ?? collectionItem}
              onSelect={onItemSelect}
              reorderBookmarks={reorderBookmarks}
              onToggle={setExpandBookmarks}
              initialState={expandBookmarks ? "expanded" : "collapsed"}
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
    ({ closePopover }: { closePopover: () => void }) => (
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
