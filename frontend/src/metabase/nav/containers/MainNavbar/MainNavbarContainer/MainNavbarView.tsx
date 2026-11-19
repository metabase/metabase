import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { CollectionTreeItem } from "metabase/common/collections/utils";
import {
  isInstanceAnalyticsCollection,
  isLibraryCollection,
  isRootTrashCollection,
} from "metabase/common/collections/utils";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { Tree } from "metabase/common/components/tree";
import { useShowOtherUsersCollections } from "metabase/common/hooks/use-show-other-users-collections";
import {
  getIsTenantUser,
  getUser,
  getUserCanWriteToCollections,
} from "metabase/current-user";
import { NavbarLibrarySection } from "metabase/nav/containers/MainNavbar/NavbarLibrarySection";
import { PrototypeControls } from "metabase/nav/prototype/PrototypeControls";
import { useGitIntegrationEnabled } from "metabase/nav/prototype/use-git-integration-enabled";
import {
  PLUGIN_DATA_APPS,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/selectors/onboarding";
import { useSetting, useUserSetting } from "metabase/settings";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { isSmallScreen } from "metabase/utils/dom";
import type { Bookmark, Collection } from "metabase-types/api";

import { SidebarHeading, SidebarSection } from "../Sidebar";
import { SidebarCollectionLink, SidebarLink } from "../SidebarItems";
import {
  trackAddDataModalOpened,
  trackNewCollectionFromNavInitiated,
} from "../analytics";
import type { SelectedItem } from "../types";

import { AddDataModal } from "./AddDataModal";
import BookmarkList from "./BookmarkList";
import { GettingStartedSection } from "./GettingStartedSection";
import { DatabasesNavLink, OfficialNavSection } from "./OfficialNavSection";

type Props = {
  isOpen: boolean;
  bookmarks: Bookmark[];
  hasDataAccess: boolean;
  collections: CollectionTreeItem[];
  selectedItems: SelectedItem[];
  sharedTenantCollections?: Collection[];
  canAccessTenantSpecificCollections: boolean;
  canCreateSharedCollection: boolean;
  showExternalCollectionsSection: boolean;
  handleCloseNavbar: () => void;
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

type NavView = "official" | "explorations" | "bookmarks";

const OTHER_USERS_COLLECTIONS_URL = Urls.otherUsersPersonalCollections();

/** Drops synced collections (and everything inside them) from a nav tree. */
function withoutSyncedCollections(
  items: CollectionTreeItem[],
): CollectionTreeItem[] {
  return items
    .filter((item) => !item.is_remote_synced)
    .map((item) => ({
      ...item,
      children: withoutSyncedCollections(item.children),
    }));
}

export function MainNavbarView({
  bookmarks,
  collections,
  selectedItems,
  hasDataAccess,
  reorderBookmarks,
  handleCreateNewCollection,
  handleCloseNavbar,
  sharedTenantCollections,
  canAccessTenantSpecificCollections,
  canCreateSharedCollection,
  showExternalCollectionsSection,
}: Props) {
  const [expandBookmarks = true, setExpandBookmarks] = useUserSetting(
    "expand-bookmarks-in-nav",
  );
  const [expandCollections = true, setExpandCollections] = useUserSetting(
    "expand-collections-in-nav",
  );

  // With git integration on, the nav shows synced ("Official") content first;
  // Explorations (everything else) and Bookmarks are one level in, behind nav
  // items.
  const { isEnabled: isGitIntegrationEnabled } = useGitIntegrationEnabled();
  const [navView, setNavView] = useState<NavView>("official");
  const showOfficial = isGitIntegrationEnabled && navView === "official";
  const showExplorations =
    isGitIntegrationEnabled && navView === "explorations";
  const showBookmarks = isGitIntegrationEnabled && navView === "bookmarks";
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
    "non-entity": nonEntityItem,
  } = _.indexBy(selectedItems, (item) => item.type);

  const onItemSelect = useCallback(() => {
    if (isSmallScreen()) {
      handleCloseNavbar();
    }
  }, [handleCloseNavbar]);

  const { regularCollections, trashCollection } = useMemo(() => {
    const trashCollection = collections.find(isRootTrashCollection);

    // Usage analytics lives in Monitor's Content management section. With
    // git integration on, synced collections are listed in the Official
    // view, so Explorations leaves them out.
    const regularCollections = collections.filter((c) => {
      const isNormalCollection =
        !isRootTrashCollection(c) && !isInstanceAnalyticsCollection(c);
      return isNormalCollection && !isLibraryCollection(c);
    });
    const exploredCollections = isGitIntegrationEnabled
      ? withoutSyncedCollections(regularCollections)
      : regularCollections;

    return {
      trashCollection,
      regularCollections:
        useTenants && isTenantUser
          ? PLUGIN_TENANTS.getFlattenedCollectionsForNavbar({
              currentUser,
              sharedTenantCollections,
              regularCollections: exploredCollections,
            })
          : exploredCollections,
    };
  }, [
    collections,
    isGitIntegrationEnabled,
    isTenantUser,
    useTenants,
    sharedTenantCollections,
    currentUser,
  ]);

  const isNewInstance = useSelector(getIsNewInstance);
  const canAccessOnboarding = useSelector(getCanAccessOnboardingPage);
  const shouldDisplayGettingStarted =
    isNewInstance && canAccessOnboarding && !isGitIntegrationEnabled;

  const showOtherUsersCollections = useShowOtherUsersCollections();

  const collectionsHeading = showExternalCollectionsSection
    ? t`Internal Collections`
    : t`Collections`;

  const newCollectionButton =
    canWriteToCollections && !isTenantUser ? (
      <Tooltip label={t`Create a new collection`}>
        <ActionIcon
          variant="subtle"
          aria-label={t`Create a new collection`}
          onClick={() => {
            trackNewCollectionFromNavInitiated();
            handleCreateNewCollection();
          }}
        >
          <Icon name="add" />
        </ActionIcon>
      </Tooltip>
    ) : null;

  const collectionsList = (
    <>
      <Tree
        data={regularCollections}
        selectedId={collectionItem?.id}
        onSelect={onItemSelect}
        TreeNode={SidebarCollectionLink}
        role="tree"
        aria-label="collection-tree"
        rightSection={(item) =>
          typeof item.id === "number" && (
            <PLUGIN_REMOTE_SYNC.ChangesBadge
              target={{ type: "collection", id: item.id }}
            />
          )
        }
      />
      {showOtherUsersCollections && (
        <SidebarLink
          icon="group"
          url={OTHER_USERS_COLLECTIONS_URL}
          isSelected={collectionItem?.id === "users"}
        >
          {t`Other users' personal collections`}
        </SidebarLink>
      )}
    </>
  );

  return (
    <ErrorBoundary>
      <Flex direction="column" justify="space-between" flex={1}>
        <div>
          {(showExplorations || showBookmarks) && (
            <SidebarSection>
              {/* In Explorations, this row also holds "new collection", since
                  the Collections heading is gone. */}
              <Flex align="center" justify="space-between" pe="sm">
                <Button
                  variant="subtle"
                  leftSection={<Icon name="chevronleft" />}
                  // Puts the chevron's center on the nav's icon column.
                  ml={5.5}
                  onClick={() => setNavView("official")}
                >
                  {t`Back`}
                </Button>
                {showExplorations && newCollectionButton}
              </Flex>
            </SidebarSection>
          )}

          {showBookmarks && (
            <SidebarSection>
              <ErrorBoundary>
                {bookmarks.length > 0 ? (
                  <BookmarkList
                    bookmarks={bookmarks}
                    selectedItem={cardItem ?? dashboardItem ?? collectionItem}
                    onSelect={onItemSelect}
                    reorderBookmarks={reorderBookmarks}
                    onToggle={_.noop}
                    initialState="expanded"
                  />
                ) : (
                  <>
                    <SidebarHeading>{t`Bookmarks`}</SidebarHeading>
                    <Text c="text-secondary" fz="sm" ps="lg" pt="sm">
                      {t`Nothing bookmarked yet.`}
                    </Text>
                  </>
                )}
              </ErrorBoundary>
            </SidebarSection>
          )}

          {showOfficial && (
            <OfficialNavSection
              collections={collections}
              selectedCollectionId={collectionItem?.id}
              nonEntityItem={nonEntityItem}
              hasDataAccess={hasDataAccess}
              onItemSelect={onItemSelect}
            />
          )}

          {showOfficial && (
            <SidebarSection>
              <SidebarHeading>{t`More`}</SidebarHeading>
              <SidebarLink
                icon="telescope"
                right={
                  <Icon name="chevronright" size={12} c="text-secondary" />
                }
                onClick={() => setNavView("explorations")}
              >
                {t`Explorations`}
              </SidebarLink>
              <SidebarLink
                icon="bookmark"
                right={
                  <Icon name="chevronright" size={12} c="text-secondary" />
                }
                onClick={() => setNavView("bookmarks")}
              >
                {t`Bookmarks`}
              </SidebarLink>
            </SidebarSection>
          )}

          {(!isGitIntegrationEnabled || showExplorations) && (
            <>
              {shouldDisplayGettingStarted && (
                <SidebarSection>
                  <ErrorBoundary>
                    <GettingStartedSection
                      nonEntityItem={nonEntityItem}
                      onAddDataModalOpen={() => {
                        trackAddDataModalOpened("getting-started");
                        openAddDataModal();
                      }}
                    />
                  </ErrorBoundary>
                </SidebarSection>
              )}

              {bookmarks.length > 0 && !showExplorations && (
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

              {!showExplorations && (
                <NavbarLibrarySection
                  collections={collections}
                  selectedId={collectionItem?.id}
                  onItemSelect={onItemSelect}
                >
                  {hasDataAccess && (
                    <DatabasesNavLink
                      nonEntityItem={nonEntityItem}
                      onItemSelect={onItemSelect}
                    />
                  )}
                </NavbarLibrarySection>
              )}

              <SidebarSection>
                <ErrorBoundary>
                  {showExplorations ? (
                    collectionsList
                  ) : (
                    <CollapseSection
                      header={
                        <SidebarHeading>{collectionsHeading}</SidebarHeading>
                      }
                      initialState={
                        expandCollections ? "expanded" : "collapsed"
                      }
                      iconPosition="right"
                      iconSize={8}
                      onToggle={setExpandCollections}
                      rightAction={newCollectionButton}
                      role="section"
                      aria-label={t`Collections`}
                    >
                      {collectionsList}
                    </CollapseSection>
                  )}
                </ErrorBoundary>
              </SidebarSection>

              {PLUGIN_DATA_APPS.isEnabled && !showExplorations && (
                <PLUGIN_DATA_APPS.MainNavbarSection
                  onItemSelect={onItemSelect}
                />
              )}
            </>
          )}
        </div>

        <SidebarSection>
          <Flex align="center" gap="xs">
            <Box flex={1} miw={0}>
              {trashCollection &&
                (!isGitIntegrationEnabled || showExplorations) && (
                  <ErrorBoundary>
                    <Tree
                      data={[trashCollection]}
                      selectedId={collectionItem?.id}
                      onSelect={onItemSelect}
                      TreeNode={SidebarCollectionLink}
                      role="tree"
                    />
                  </ErrorBoundary>
                )}
            </Box>
            <PrototypeControls />
          </Flex>
        </SidebarSection>
      </Flex>

      <AddDataModal opened={addDataModalOpened} onClose={closeAddDataModal} />
    </ErrorBoundary>
  );
}
