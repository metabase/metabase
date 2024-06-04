import { useCallback } from "react";
import { c, t } from "ttag";
import _ from "underscore";

import { useUserSetting } from "metabase/common/hooks";
import CollapseSection from "metabase/components/CollapseSection";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { Tree } from "metabase/components/tree";
import CS from "metabase/css/core/index.css";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections/constants";
import { getCollectionIcon } from "metabase/entities/collections/utils";
import { isSmallScreen } from "metabase/lib/dom";
import * as Urls from "metabase/lib/urls";
import { WhatsNewNotification } from "metabase/nav/components/WhatsNewNotification";
import UploadCSV from "metabase/nav/containers/MainNavbar/SidebarItems/UploadCSV";
import type { IconName, IconProps } from "metabase/ui";
import type { Bookmark, Collection, Database, User } from "metabase-types/api";

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
  databases: Database[];
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
const BROWSE_MODELS_URL = "/browse/models";
const BROWSE_DATA_URL = "/browse/databases";
const OTHER_USERS_COLLECTIONS_URL = Urls.otherUsersPersonalCollections();
const ADD_YOUR_OWN_DATA_URL = "/admin/databases/create";

function MainNavbarView({
  isAdmin,
  currentUser,
  bookmarks,
  collections,
  databases,
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

  const [expandBrowse = true, setExpandBrowse] = useUserSetting(
    "expand-browse-in-nav",
  );
  const [expandBookmarks = true, setExpandBookmarks] = useUserSetting(
    "expand-bookmarks-in-nav",
  );

  // upload CSVs
  const databaseDWH = databases.find(
    ({ name }) =>
      name.includes("Cloud data warehouse") || name === "Sample Database",
  );
  const collectionRoot = collections.find(
    ({ id, can_write }) => (id === null || id === "root") && can_write,
  );

  return (
    <SidebarContentRoot>
      <div>
        <SidebarSection>
          <PaddedSidebarLink
            isSelected={nonEntityItem?.url === "/"}
            icon="home"
            onClick={onItemSelect}
            url="/"
          >
            {t`Home`}
          </PaddedSidebarLink>

          {databaseDWH && collectionRoot && (
            <UploadCSV collection={collectionRoot} />
          )}
        </SidebarSection>
        <SidebarSection>
          <CollapseSection
            header={
              <SidebarHeading>{c("A verb, shown in the sidebar")
                .t`Browse`}</SidebarHeading>
            }
            initialState={expandBrowse ? "expanded" : "collapsed"}
            iconPosition="right"
            iconSize={8}
            headerClass={CS.mb1}
            onToggle={setExpandBrowse}
          >
            <PaddedSidebarLink
              icon="model"
              url={BROWSE_MODELS_URL}
              isSelected={nonEntityItem?.url?.startsWith(BROWSE_MODELS_URL)}
              onClick={onItemSelect}
              aria-label={t`Browse models`}
            >
              {t`Models`}
            </PaddedSidebarLink>
            {hasDataAccess && (
              <PaddedSidebarLink
                icon="database"
                url={BROWSE_DATA_URL}
                isSelected={nonEntityItem?.url?.startsWith(BROWSE_DATA_URL)}
                onClick={onItemSelect}
                aria-label={t`Browse databases`}
              >
                {t`Databases`}
              </PaddedSidebarLink>
            )}
          </CollapseSection>
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
