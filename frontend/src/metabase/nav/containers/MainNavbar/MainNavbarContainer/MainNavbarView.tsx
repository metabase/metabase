import { useDisclosure } from "@mantine/hooks";
import type { MouseEvent } from "react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { CollectionTreeItem } from "metabase/common/collections/utils";
import {
  isExamplesCollection,
  isInstanceAnalyticsCollection,
  isLibraryCollection,
  isRootCollection,
  isRootPersonalCollection,
  isRootTrashCollection,
} from "metabase/common/collections/utils";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { Tree } from "metabase/common/components/tree";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";
import { useShowOtherUsersCollections } from "metabase/common/hooks/use-show-other-users-collections";
import {
  getIsTenantUser,
  getUser,
  getUserCanWriteToCollections,
} from "metabase/current-user";
import { NavbarLibrarySection } from "metabase/nav/containers/MainNavbar/NavbarLibrarySection";
import {
  SubNavHeading,
  SubNavSection,
} from "metabase/nav/containers/ProtoNavbar/SubNav";
import { PROTO_NAV_ENABLED } from "metabase/nav/containers/ProtoNavbar/flag";
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
import { ActionIcon, Flex, Icon, Tooltip } from "metabase/ui";
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
import { BrowseNavSection } from "./BrowseNavSection";
import { GettingStartedSection } from "./GettingStartedSection";

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
}: Props) {
  const [expandBookmarks = true, setExpandBookmarks] = useUserSetting(
    "expand-bookmarks-in-nav",
  );
  const [expandCollections = true, setExpandCollections] = useUserSetting(
    "expand-collections-in-nav",
  );

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
    "non-entity": nonEntityItem,
  } = _.indexBy(selectedItems, (item) => item.type);

  const onItemSelect = useCallback(() => {
    if (isSmallScreen()) {
      handleCloseNavbar();
    }
  }, [handleCloseNavbar]);

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
        if (isRootTrashCollection(c) || isLibraryCollection(c)) {
          return false;
        }
        // Usage analytics moves to the Monitor section in the prototype nav.
        if (PROTO_NAV_ENABLED && isInstanceAnalyticsCollection(c)) {
          return false;
        }
        // The personal collection is hidden from the prototype collections tree.
        if (PROTO_NAV_ENABLED && isRootPersonalCollection(c)) {
          return false;
        }
        // Examples lives under Our analytics in proto nav; legacy nav shows it
        // in Getting Started instead.
        if (!PROTO_NAV_ENABLED && isExamplesCollection(c)) {
          return false;
        }
        return true;
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

  const {
    protoCollectionsTree,
    protoInitialExpandedIds,
    protoPinnedExpandedIds,
  } = useMemo(() => {
    const root = PROTO_NAV_ENABLED
      ? regularCollections.find(isRootCollection)
      : undefined;

    if (!root) {
      return {
        protoCollectionsTree: regularCollections,
        protoInitialExpandedIds: undefined,
        protoPinnedExpandedIds: undefined,
      };
    }

    const children = regularCollections.filter(
      (collection) => !isRootCollection(collection),
    );
    const rootId = root.id ?? ROOT_COLLECTION.id;

    return {
      protoCollectionsTree: [{ ...root, id: rootId, children }],
      protoInitialExpandedIds: [rootId],
      protoPinnedExpandedIds: [rootId],
    };
  }, [regularCollections]);

  const collectionsHeading = showExternalCollectionsSection
    ? t`Internal Collections`
    : t`Collections`;

  const collectionChangesBadge = (item: { id: string | number }) =>
    typeof item.id === "number" && (
      <PLUGIN_REMOTE_SYNC.ChangesBadge
        target={{ type: "collection", id: item.id }}
      />
    );

  const protoCollectionsBlock = (
    <SubNavSection>
      <ErrorBoundary>
        <SubNavHeading>{t`Collections`}</SubNavHeading>
        <Tree
          data={protoCollectionsTree}
          selectedId={collectionItem?.id}
          initialExpandedIds={protoInitialExpandedIds}
          pinnedExpandedIds={protoPinnedExpandedIds}
          onSelect={onItemSelect}
          TreeNode={SidebarCollectionLink}
          role="tree"
          aria-label="collection-tree"
          rightSection={collectionChangesBadge}
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
      </ErrorBoundary>
    </SubNavSection>
  );

  return (
    <ErrorBoundary>
      {/* In the proto nav, don't stretch: History sits right below it. */}
      <Flex
        direction="column"
        justify="space-between"
        flex={PROTO_NAV_ENABLED ? undefined : 1}
      >
        <div>
          {/* In the proto nav this leads the Explorations tab (collections),
              with History below it. */}
          {PROTO_NAV_ENABLED && protoCollectionsBlock}

          {!PROTO_NAV_ENABLED && (
            <SidebarSection>
              <SidebarLink
                isSelected={nonEntityItem?.url === "/"}
                icon="home"
                onClick={handleHomeClick}
                url="/"
              >
                {t`Home`}
              </SidebarLink>
            </SidebarSection>
          )}

          {!PROTO_NAV_ENABLED && shouldDisplayGettingStarted && (
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

          {/* Tenant users don't see the section about "External collections".
              Hidden in the proto nav's Explorations tab. */}
          {!PROTO_NAV_ENABLED && showExternalCollectionsSection && (
            <PLUGIN_TENANTS.MainNavSharedCollections
              canAccessTenantSpecificCollections={
                canAccessTenantSpecificCollections
              }
              canCreateSharedCollection={canCreateSharedCollection}
              sharedTenantCollections={sharedTenantCollections}
            />
          )}

          {!PROTO_NAV_ENABLED && (
            <NavbarLibrarySection
              collections={collections}
              selectedId={collectionItem?.id}
              onItemSelect={onItemSelect}
            />
          )}

          {!PROTO_NAV_ENABLED && (
            <SidebarSection>
              <ErrorBoundary>
                <CollapseSection
                  header={<SidebarHeading>{collectionsHeading}</SidebarHeading>}
                  initialState={expandCollections ? "expanded" : "collapsed"}
                  iconPosition="right"
                  iconSize={8}
                  onToggle={setExpandCollections}
                  rightAction={
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
                    ) : null
                  }
                  role="section"
                  aria-label={t`Collections`}
                >
                  <Tree
                    data={regularCollections}
                    selectedId={collectionItem?.id}
                    onSelect={onItemSelect}
                    TreeNode={SidebarCollectionLink}
                    role="tree"
                    aria-label="collection-tree"
                    rightSection={collectionChangesBadge}
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
                </CollapseSection>
              </ErrorBoundary>
            </SidebarSection>
          )}

          {/* The proto nav lists data apps on the Home tab instead. */}
          {!PROTO_NAV_ENABLED && PLUGIN_DATA_APPS.isEnabled && (
            <PLUGIN_DATA_APPS.MainNavbarSection onItemSelect={onItemSelect} />
          )}

          {!PROTO_NAV_ENABLED && (
            <SidebarSection>
              <ErrorBoundary>
                <BrowseNavSection
                  nonEntityItem={nonEntityItem}
                  onItemSelect={onItemSelect}
                  hasDataAccess={hasDataAccess}
                  onAddDataModalOpen={openAddDataModal}
                />
              </ErrorBoundary>
            </SidebarSection>
          )}

          {!PROTO_NAV_ENABLED && trashCollection && (
            <SidebarSection>
              <ErrorBoundary>
                <Tree
                  data={[trashCollection]}
                  selectedId={collectionItem?.id}
                  onSelect={onItemSelect}
                  TreeNode={SidebarCollectionLink}
                  role="tree"
                />
              </ErrorBoundary>
            </SidebarSection>
          )}
        </div>
      </Flex>

      <AddDataModal opened={addDataModalOpened} onClose={closeAddDataModal} />
    </ErrorBoundary>
  );
}
