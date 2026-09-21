import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import type { MouseEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import type { CollectionTreeItem } from "metabase/common/collections/utils";
import {
  isExamplesCollection,
  isLibraryCollection,
  isRootTrashCollection,
} from "metabase/common/collections/utils";
import { Tree } from "metabase/common/components/tree";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";
import { useShowOtherUsersCollections } from "metabase/common/hooks/use-show-other-users-collections";
import {
  getIsTenantUser,
  getUser,
  getUserCanWriteToCollections,
} from "metabase/current-user";
import { MetabotAppBarButton } from "metabase/metabot/components/MetabotAppBarButton";
import NewItemButton from "metabase/nav/components/NewItemButton";
import { NavDrawer } from "metabase/nav/containers/MainNavbar/NavDrawer";
import { NavSectionSwitcher } from "metabase/nav/containers/MainNavbar/NavSectionSwitcher";
import { OfficialNav } from "metabase/nav/containers/MainNavbar/OfficialNav";
import { RawDataTree } from "metabase/nav/containers/MainNavbar/RawDataTree";
import {
  PLUGIN_DATA_APPS,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getEntityTypes } from "metabase/redux/embedding-data-picker";
import { getOpenNavItems } from "metabase/selectors/app";
import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/selectors/onboarding";
import { useSetting, useUserSetting } from "metabase/settings";
import { ActionIcon, Box, Group, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isWithinIframe } from "metabase/utils/iframe";
import type { Bookmark, Collection } from "metabase-types/api";

import {
  PaddedSidebarLink,
  SidebarContentRoot,
  SidebarSection,
  TrashSidebarSection,
} from "../MainNavbar.styled";
import { SidebarCollectionLink } from "../SidebarItems";
import {
  trackAddDataModalOpened,
  trackNewCollectionFromNavInitiated,
} from "../analytics";
import type { SelectedItem } from "../types";
import { useNavSection } from "../use-nav-section";

import { AddDataModal } from "./AddDataModal";
import BookmarkList from "./BookmarkList";
import { GettingStartedSection } from "./GettingStartedSection";
import S from "./MainNavbarView.module.css";
import { OpenItemsSection } from "./OpenItemsSection";
import { useCanAddData } from "./use-can-add-data";

type Props = {
  bookmarks: Bookmark[];
  hasDataAccess: boolean;
  collections: CollectionTreeItem[];
  selectedItems: SelectedItem[];
  sharedTenantCollections?: Collection[];
  canAccessTenantSpecificCollections: boolean;
  canCreateSharedCollection: boolean;
  showExternalCollectionsSection: boolean;
  handleLogout: () => void;
  handleCreateNewCollection: () => void;
  reorderBookmarks: ({
    newIndex,
    oldIndex,
  }: {
    newIndex: number;
    oldIndex: number;
  }) => Promise<any>;
};
const OTHER_USERS_COLLECTIONS_URL = Urls.otherUsersPersonalCollections();

export function MainNavbarView({
  bookmarks,
  collections,
  selectedItems,
  hasDataAccess,
  reorderBookmarks,
  handleCreateNewCollection,
  sharedTenantCollections,
  canAccessTenantSpecificCollections,
  canCreateSharedCollection,
  showExternalCollectionsSection,
}: Props) {
  const [expandBookmarks = true, setExpandBookmarks] = useUserSetting(
    "expand-bookmarks-in-nav",
  );

  const [railNode, setRailNode] = useState<HTMLDivElement | null>(null);
  const [
    isCollectionsDrawerOpen,
    { toggle: toggleCollectionsDrawer, close: closeCollectionsDrawer },
  ] = useDisclosure(false);
  const [
    isRawDataDrawerOpen,
    { toggle: toggleRawDataDrawer, close: closeRawDataDrawer },
  ] = useDisclosure(false);
  const openItems = useSelector(getOpenNavItems);

  const isAtHomepageDashboard = useIsAtHomepageDashboard();
  const canWriteToCollections = useSelector(getUserCanWriteToCollections);
  const currentUser = useSelector(getUser);
  const useTenants = useSetting("use-tenants");
  const isTenantUser = useSelector(getIsTenantUser);

  const [
    addDataModalOpened,
    { open: openAddDataModal, close: closeAddDataModal },
  ] = useDisclosure(false);

  const {
    card: cardItem,
    collection: collectionItem,
    dashboard: dashboardItem,
    table: tableItem,
    "non-entity": nonEntityItem,
  } = _.indexBy(selectedItems, (item) => item.type);

  const openKey = cardItem
    ? `card-${cardItem.id}`
    : dashboardItem
      ? `dashboard-${dashboardItem.id}`
      : undefined;

  // The Official rail renders items alongside collections, keyed by search model, so the open
  // entity outranks its containing collection for highlighting.
  const officialEntityItem = cardItem ?? tableItem;
  const officialSelectedId =
    officialEntityItem?.model && officialEntityItem.id != null
      ? `${officialEntityItem.model}-${officialEntityItem.id}`
      : dashboardItem?.id != null
        ? `dashboard-${dashboardItem.id}`
        : collectionItem?.id;

  // Kept as a no-op hook point: the rail no longer closes on selection.
  const onItemSelect = useCallback(() => {}, []);

  const handleHomeClick = useCallback(
    (event: MouseEvent) => {
      // Prevent navigating to the dashboard homepage when a user is already there
      // https://github.com/metabase/metabase/issues/43800
      if (isAtHomepageDashboard) {
        event.preventDefault();
      }
      onItemSelect();
    },
    [isAtHomepageDashboard, onItemSelect],
  );

  const { regularCollections, trashCollection, examplesCollection } =
    useMemo(() => {
      const trashCollection = collections.find(isRootTrashCollection);
      const examplesCollection = collections.find(isExamplesCollection);

      const regularCollections = collections.filter((c) => {
        const isNormalCollection =
          !isRootTrashCollection(c) && !isExamplesCollection(c);
        return isNormalCollection && !isLibraryCollection(c);
      });

      const collectionsByCategory = {
        trashCollection,
        examplesCollection,
      };

      return {
        ...collectionsByCategory,
        regularCollections:
          useTenants && isTenantUser
            ? PLUGIN_TENANTS.getFlattenedCollectionsForNavbar({
                currentUser,
                sharedTenantCollections,
                regularCollections,
              })
            : regularCollections,
      };
    }, [
      collections,
      isTenantUser,
      useTenants,
      sharedTenantCollections,
      currentUser,
    ]);

  const isNewInstance = useSelector(getIsNewInstance);
  const canAccessOnboarding = useSelector(getCanAccessOnboardingPage);
  const shouldDisplayGettingStarted = isNewInstance && canAccessOnboarding;

  const showOtherUsersCollections = useShowOtherUsersCollections();

  const { section } = useNavSection();
  const isUnofficial = section === "unofficial";

  const canAddData = useCanAddData();
  const entityTypes = useSelector(getEntityTypes);
  const isEmbeddingIframe = isWithinIframe();
  const showRawData =
    hasDataAccess && (!isEmbeddingIframe || entityTypes.includes("table"));

  const collectionsHeading = showExternalCollectionsSection
    ? t`Internal Collections`
    : t`Collections`;

  return (
    <ErrorBoundary>
      <SidebarContentRoot ref={setRailNode}>
        <div className={cx({ [S.hasFooter]: isUnofficial })}>
          <NavSectionSwitcher />

          {section === "official" && (
            <OfficialNav
              collections={collections}
              selectedId={officialSelectedId}
              onItemSelect={onItemSelect}
            />
          )}

          {isUnofficial && (
            <>
              <SidebarSection>
                <Group gap="xs">
                  <MetabotAppBarButton />
                  <PLUGIN_REMOTE_SYNC.GitSyncAppBarControls />
                </Group>
              </SidebarSection>

              <SidebarSection>
                <PaddedSidebarLink
                  isSelected={nonEntityItem?.url === "/"}
                  icon="home"
                  onClick={handleHomeClick}
                  url="/"
                >
                  {t`Home`}
                </PaddedSidebarLink>
              </SidebarSection>

              {shouldDisplayGettingStarted && (
                <SidebarSection>
                  <ErrorBoundary>
                    <GettingStartedSection
                      nonEntityItem={nonEntityItem}
                      onAddDataModalOpen={() => {
                        trackAddDataModalOpened("getting-started");
                        openAddDataModal();
                      }}
                    >
                      {examplesCollection && (
                        <Tree
                          data={[examplesCollection]}
                          selectedId={collectionItem?.id}
                          onSelect={onItemSelect}
                          TreeNode={SidebarCollectionLink}
                          role="tree"
                          aria-label="examples-collection-tree"
                        />
                      )}
                    </GettingStartedSection>
                  </ErrorBoundary>
                </SidebarSection>
              )}

              {bookmarks.length > 0 && (
                <SidebarSection>
                  <ErrorBoundary>
                    <BookmarkList
                      bookmarks={bookmarks}
                      selectedItem={cardItem ?? dashboardItem ?? collectionItem}
                      onSelect={onItemSelect}
                      reorderBookmarks={reorderBookmarks}
                      onToggle={setExpandBookmarks}
                      initialState={expandBookmarks ? "expanded" : "collapsed"}
                    />
                  </ErrorBoundary>
                </SidebarSection>
              )}

              {/* Tenant users don't see the section about "External collections" */}
              {showExternalCollectionsSection && (
                <PLUGIN_TENANTS.MainNavSharedCollections
                  canAccessTenantSpecificCollections={
                    canAccessTenantSpecificCollections
                  }
                  canCreateSharedCollection={canCreateSharedCollection}
                  sharedTenantCollections={sharedTenantCollections}
                />
              )}

              <SidebarSection>
                <PaddedSidebarLink
                  icon="folder"
                  isSelected={isCollectionsDrawerOpen}
                  onClick={toggleCollectionsDrawer}
                  right={<Icon name="chevronright" size={12} />}
                >
                  {collectionsHeading}
                </PaddedSidebarLink>
              </SidebarSection>

              {PLUGIN_DATA_APPS.isEnabled && (
                <PLUGIN_DATA_APPS.MainNavbarSection
                  onItemSelect={onItemSelect}
                />
              )}

              {showRawData && (
                <SidebarSection>
                  <PaddedSidebarLink
                    icon="database"
                    isSelected={isRawDataDrawerOpen}
                    onClick={toggleRawDataDrawer}
                    right={<Icon name="chevronright" size={12} />}
                  >
                    {t`Raw data`}
                  </PaddedSidebarLink>
                </SidebarSection>
              )}

              <OpenItemsSection items={openItems} selectedKey={openKey} />
            </>
          )}
        </div>

        {isUnofficial && (
          <Box className={S.footer}>
            <NewItemButton />
          </Box>
        )}
      </SidebarContentRoot>

      <NavDrawer
        title={collectionsHeading}
        opened={isCollectionsDrawerOpen}
        onClose={closeCollectionsDrawer}
        railNode={railNode}
        actions={
          canWriteToCollections && !isTenantUser ? (
            <Tooltip label={t`Create a new collection`}>
              <ActionIcon
                aria-label={t`Create a new collection`}
                color="text-secondary"
                onClick={() => {
                  trackNewCollectionFromNavInitiated();
                  handleCreateNewCollection();
                }}
              >
                <Icon name="add" />
              </ActionIcon>
            </Tooltip>
          ) : null
        }
      >
        <ErrorBoundary>
          {PLUGIN_REMOTE_SYNC.CollectionsNavTree ? (
            <PLUGIN_REMOTE_SYNC.CollectionsNavTree
              collections={regularCollections}
              selectedId={collectionItem?.id}
              onSelect={onItemSelect}
            />
          ) : (
            <Tree
              data={regularCollections}
              selectedId={collectionItem?.id}
              onSelect={onItemSelect}
              TreeNode={SidebarCollectionLink}
              role="tree"
              aria-label="collection-tree"
            />
          )}
          {showOtherUsersCollections && (
            <PaddedSidebarLink icon="group" url={OTHER_USERS_COLLECTIONS_URL}>
              {t`Other users' personal collections`}
            </PaddedSidebarLink>
          )}

          {/* Deleted things belong with the collections they were deleted from. */}
          {trashCollection && (
            <TrashSidebarSection>
              <Tree
                data={[trashCollection]}
                selectedId={collectionItem?.id}
                onSelect={onItemSelect}
                TreeNode={SidebarCollectionLink}
                role="tree"
              />
            </TrashSidebarSection>
          )}
        </ErrorBoundary>
      </NavDrawer>

      <NavDrawer
        title={t`Raw data`}
        opened={isRawDataDrawerOpen}
        onClose={closeRawDataDrawer}
        railNode={railNode}
        actions={
          canAddData && !isEmbeddingIframe ? (
            <Tooltip label={t`Add data`}>
              <ActionIcon
                aria-label={t`Add data`}
                color="text-secondary"
                onClick={() => {
                  trackAddDataModalOpened("left-nav");
                  openAddDataModal();
                }}
              >
                <Icon name="add" />
              </ActionIcon>
            </Tooltip>
          ) : null
        }
      >
        <ErrorBoundary>
          <RawDataTree />
        </ErrorBoundary>
      </NavDrawer>

      <AddDataModal opened={addDataModalOpened} onClose={closeAddDataModal} />
    </ErrorBoundary>
  );
}
