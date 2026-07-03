import { useDisclosure } from "@mantine/hooks";
import type { MouseEvent } from "react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
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
import { ForwardRefLink } from "metabase/common/components/Link";
import { Tree } from "metabase/common/components/tree";
import { useSetting, useUserSetting } from "metabase/common/hooks";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";
import { useShowOtherUsersCollections } from "metabase/common/hooks/use-show-other-users-collections";
import { NavbarLibrarySection } from "metabase/nav/containers/MainNavbar/NavbarLibrarySection";
import PN from "metabase/nav/containers/ProtoNavbar/ProtoNavbar.module.css";
import {
  SubNavHeading,
  SubNavSection,
} from "metabase/nav/containers/ProtoNavbar/SubNav";
import { PROTO_NAV_ENABLED } from "metabase/nav/containers/ProtoNavbar/flag";
import { PLUGIN_REMOTE_SYNC, PLUGIN_TENANTS } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { setOpenModal } from "metabase/redux/ui";
import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/selectors/onboarding";
import {
  getIsTenantUser,
  getUser,
  getUserCanWriteToCollections,
} from "metabase/selectors/user";
import { ActionIcon, Icon, Menu, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isSmallScreen } from "metabase/utils/dom";
import type { Bookmark, Collection } from "metabase-types/api";

import {
  PaddedSidebarLink,
  SidebarContentRoot,
  SidebarHeading,
  SidebarSection,
  TrashSidebarSection,
} from "../MainNavbar.styled";
import { SidebarCollectionLink } from "../SidebarItems";
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

  const dispatch = useDispatch();
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
        const isNormalCollection =
          !isRootTrashCollection(c) && !isExamplesCollection(c);
        // Usage analytics moves to the Monitor section in the prototype nav.
        if (PROTO_NAV_ENABLED && isInstanceAnalyticsCollection(c)) {
          return false;
        }
        // The personal collection is hidden from the prototype collections tree.
        if (PROTO_NAV_ENABLED && isRootPersonalCollection(c)) {
          return false;
        }
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

  const {
    protoCollectionsTree,
    protoInitialExpandedIds,
    protoPinnedExpandedIds,
  } = useMemo(() => {
    if (!PROTO_NAV_ENABLED) {
      return {
        protoCollectionsTree: regularCollections,
        protoInitialExpandedIds: undefined,
        protoPinnedExpandedIds: undefined,
      };
    }

    const root = regularCollections.find(isRootCollection);
    const children = regularCollections.filter(
      (collection) => !isRootCollection(collection),
    );

    if (!root) {
      return {
        protoCollectionsTree: regularCollections,
        protoInitialExpandedIds: undefined,
        protoPinnedExpandedIds: undefined,
      };
    }

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

  const protoCollectionsBlock = (
    <SubNavSection>
      <ErrorBoundary>
        {canWriteToCollections && !isTenantUser && (
          <Menu position="bottom-start">
            <Menu.Target>
              <button
                type="button"
                className={PN.navActionButton}
                aria-label={t`Create new…`}
              >
                <span className={PN.navActionIconCircle}>
                  <Icon name="add" size={12} />
                </span>
                {t`Create`}
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Icon name="folder" />}
                onClick={() => {
                  trackNewCollectionFromNavInitiated();
                  handleCreateNewCollection();
                }}
              >
                {t`Collection`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="dashboard" />}
                onClick={() => dispatch(setOpenModal("dashboard"))}
              >
                {t`Dashboard`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="document" />}
                component={ForwardRefLink}
                to="/document/new"
              >
                {t`Document`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
        <SubNavHeading>{t`Collections`}</SubNavHeading>
        {PLUGIN_REMOTE_SYNC.CollectionsNavTree ? (
          <PLUGIN_REMOTE_SYNC.CollectionsNavTree
            collections={protoCollectionsTree}
            selectedId={collectionItem?.id}
            onSelect={onItemSelect}
            initialExpandedIds={protoInitialExpandedIds}
            pinnedExpandedIds={protoPinnedExpandedIds}
          />
        ) : (
          <Tree
            data={protoCollectionsTree}
            selectedId={collectionItem?.id}
            initialExpandedIds={protoInitialExpandedIds}
            pinnedExpandedIds={protoPinnedExpandedIds}
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
      </ErrorBoundary>
    </SubNavSection>
  );

  return (
    <ErrorBoundary>
      <SidebarContentRoot>
        <div>
          {/* Keep Create at the top of the proto Home tab so its spacing
              matches Query's New query button when switching rails. */}
          {PROTO_NAV_ENABLED && protoCollectionsBlock}

          {!PROTO_NAV_ENABLED && (
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
          )}

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
                  role="section"
                  aria-label={t`Collections`}
                >
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
                    <PaddedSidebarLink
                      icon="group"
                      url={OTHER_USERS_COLLECTIONS_URL}
                    >
                      {t`Other users' personal collections`}
                    </PaddedSidebarLink>
                  )}
                </CollapseSection>
              </ErrorBoundary>
            </SidebarSection>
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
            <TrashSidebarSection>
              <ErrorBoundary>
                <Tree
                  data={[trashCollection]}
                  selectedId={collectionItem?.id}
                  onSelect={onItemSelect}
                  TreeNode={SidebarCollectionLink}
                  role="tree"
                />
              </ErrorBoundary>
            </TrashSidebarSection>
          )}
        </div>
      </SidebarContentRoot>

      <AddDataModal opened={addDataModalOpened} onClose={closeAddDataModal} />
    </ErrorBoundary>
  );
}
