import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { CollectionTreeItem } from "metabase/common/collections/utils";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { Tree } from "metabase/common/components/tree";
import { useShowOtherUsersCollections } from "metabase/common/hooks/use-show-other-users-collections";
import {
  getIsTenantUser,
  getUserCanWriteToCollections,
} from "metabase/current-user";
import { NavbarLibrarySection } from "metabase/nav/containers/MainNavbar/NavbarLibrarySection";
import { useGitIntegrationEnabled } from "metabase/nav/prototype/use-git-integration-enabled";
import { PLUGIN_DATA_APPS, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/selectors/onboarding";
import { useUserSetting } from "metabase/settings";
import { ActionIcon, Button, Flex, Icon, Text, Tooltip } from "metabase/ui";
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
import { ExternalCollectionsNavSection } from "./ExternalCollectionsNavSection";
import { GettingStartedSection } from "./GettingStartedSection";
import {
  DatabasesNavLink,
  ModelsNavLink,
  OfficialNavSection,
} from "./OfficialNavSection";
import { useNavCollections } from "./use-nav-collections";

export type MainNavbarViewProps = {
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

type NavView =
  | "official"
  | "explorations"
  | "external-collections"
  | "bookmarks";

const OTHER_USERS_COLLECTIONS_URL = Urls.otherUsersPersonalCollections();

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
}: MainNavbarViewProps) {
  const [expandBookmarks = true, setExpandBookmarks] = useUserSetting(
    "expand-bookmarks-in-nav",
  );
  const [expandCollections = true, setExpandCollections] = useUserSetting(
    "expand-collections-in-nav",
  );

  // With git integration on, the nav shows synced ("Official") content first;
  // Explorations (everything else), External collections and Bookmarks are one
  // level in, behind nav items.
  const { isEnabled: isGitIntegrationEnabled } = useGitIntegrationEnabled();
  const [selectedNavView, setNavView] = useState<NavView>("official");
  // Falls back to Official if External collections goes away (tenants off).
  const navView =
    selectedNavView === "external-collections" &&
    !showExternalCollectionsSection
      ? "official"
      : selectedNavView;
  const showOfficial = isGitIntegrationEnabled && navView === "official";
  const showExplorations =
    isGitIntegrationEnabled && navView === "explorations";
  const showExternalCollections =
    isGitIntegrationEnabled && navView === "external-collections";
  const showBookmarks = isGitIntegrationEnabled && navView === "bookmarks";
  const canWriteToCollections = useSelector(getUserCanWriteToCollections);
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

  const { regularCollections, trashCollection } = useNavCollections(
    collections,
    sharedTenantCollections,
  );

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
          {(showExplorations || showExternalCollections || showBookmarks) && (
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

          {showExternalCollections && (
            <ExternalCollectionsNavSection
              canAccessTenantSpecificCollections={
                canAccessTenantSpecificCollections
              }
              canCreateSharedCollection={canCreateSharedCollection}
              sharedTenantCollections={sharedTenantCollections}
            />
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
                icon="files"
                right={
                  <Icon name="chevronright" size={12} c="text-secondary" />
                }
                onClick={() => setNavView("explorations")}
              >
                {t`Saved`}
              </SidebarLink>
              {showExternalCollectionsSection && (
                <SidebarLink
                  icon="globe"
                  right={
                    <Icon name="chevronright" size={12} c="text-secondary" />
                  }
                  onClick={() => setNavView("external-collections")}
                >
                  {t`External collections`}
                </SidebarLink>
              )}
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

              {/* Tenant users don't see the section about "External collections".
                  With git integration on, it's behind its own nav item. */}
              {showExternalCollectionsSection && !showExplorations && (
                <ExternalCollectionsNavSection
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
                  <ModelsNavLink
                    nonEntityItem={nonEntityItem}
                    onItemSelect={onItemSelect}
                  />
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
        </SidebarSection>
      </Flex>

      <AddDataModal opened={addDataModalOpened} onClose={closeAddDataModal} />
    </ErrorBoundary>
  );
}
