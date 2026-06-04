import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { push } from "react-router-redux";
import { tinykeys } from "tinykeys";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import type { CollectionTreeItem } from "metabase/collections/utils";
import {
  isExamplesCollection,
  isLibraryCollection,
  isRootTrashCollection,
} from "metabase/collections/utils";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import { Tree } from "metabase/common/components/tree";
import { useSetting, useUserSetting } from "metabase/common/hooks";
import { useShowOtherUsersCollections } from "metabase/common/hooks/use-show-other-users-collections";
import { NavbarLibrarySection } from "metabase/data-studio/nav/components/NavbarLibrarySection";
import { canAccessDataStudio as canAccessDataStudioSelector } from "metabase/data-studio/selectors";
import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/home/selectors";
import { PLUGIN_REMOTE_SYNC, PLUGIN_TENANTS } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import {
  getIsTenantUser,
  getUser,
  getUserCanWriteToCollections,
} from "metabase/selectors/user";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
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
import { NavbarErrorView } from "../NavbarErrorView";
import { NavbarLoadingView } from "../NavbarLoadingView";
import { type NavbarTab, NavbarTabBar } from "../NavbarTabBar";
import { NavbarTopRow } from "../NavbarTopRow";
import { SidebarCollectionLink } from "../SidebarItems";
import {
  trackAddDataModalOpened,
  trackNewCollectionFromNavInitiated,
} from "../analytics";
import type { SelectedItem } from "../types";

import { AddDataModal } from "./AddDataModal";
import BookmarkList from "./BookmarkList";
import { BrowseNavSection } from "./BrowseNavSection";
import { DataStudioNavSection } from "./DataStudioNavSection";
import { GettingStartedSection } from "./GettingStartedSection";
import { MetabotArtifactsSection } from "./MetabotArtifactsSection";
import { MetabotThreadsSection } from "./MetabotThreadsSection";

type Props = {
  isOpen: boolean;
  pathname: string;
  bookmarks: Bookmark[];
  hasDataAccess: boolean;
  isLoading: boolean;
  hasError: boolean;
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

// On the chat home (`/`) and any `/chat/...` thread the Chats tab is the natural
// landing panel; collection/browse/etc. routes default to the App tab.
function deriveRouteMainTab(pathname: string): "chats" | "app" {
  if (pathname === "/" || pathname.startsWith("/chat")) {
    return "chats";
  }
  return "app";
}

export function MainNavbarView({
  pathname,
  bookmarks,
  collections,
  selectedItems,
  hasDataAccess,
  isLoading,
  hasError,
  reorderBookmarks,
  handleCreateNewCollection,
  handleCloseNavbar,
  sharedTenantCollections,
  canAccessTenantSpecificCollections,
  canCreateSharedCollection,
  showExternalCollectionsSection,
}: Props) {
  const dispatch = useDispatch();
  const canAccessDataStudio = useSelector(canAccessDataStudioSelector);

  const isDataStudioRoute = pathname.startsWith("/data-studio");

  // The Chats/App split lives inside the main app, so it can't be derived from
  // the URL alone (collections and chats share routes). We default to the
  // route-appropriate tab and let an explicit tab click override it for the
  // current page; navigating to a new page clears the override — unless the
  // navigation was itself triggered by a tab click (e.g. leaving Data Studio),
  // in which case the clicked tab stays active on the page we land on.
  const [overrideTab, setOverrideTab] = useState<"chats" | "app" | null>(null);
  const prevPathnameRef = useRef(pathname);
  const pendingTabRef = useRef<"chats" | "app" | null>(null);
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setOverrideTab(pendingTabRef.current);
      pendingTabRef.current = null;
    }
  }, [pathname]);

  const mainTab = overrideTab ?? deriveRouteMainTab(pathname);
  const activeTab: NavbarTab = isDataStudioRoute ? "data-studio" : mainTab;

  const handleSelectTab = useCallback(
    (tab: NavbarTab) => {
      if (tab === "data-studio") {
        dispatch(push(Urls.dataStudio()));
        return;
      }
      setOverrideTab(tab);
      // Selecting a main-app tab while inside Data Studio returns to the app;
      // keep the clicked tab active on the chat home we land on.
      if (isDataStudioRoute) {
        pendingTabRef.current = tab;
        dispatch(push("/"));
      }
    },
    [dispatch, isDataStudioRoute],
  );

  // Cmd/Ctrl+1/2/3 switch sidebar tabs in their displayed order
  // (App, Chats, Data Studio).
  useEffect(() => {
    return tinykeys(window, {
      "$mod+1": (e) => {
        e.preventDefault();
        handleSelectTab("app");
      },
      "$mod+2": (e) => {
        e.preventDefault();
        handleSelectTab("chats");
      },
      ...(canAccessDataStudio && {
        "$mod+3": (e: KeyboardEvent) => {
          e.preventDefault();
          handleSelectTab("data-studio");
        },
      }),
    });
  }, [handleSelectTab, canAccessDataStudio]);

  const [expandBookmarks = true, setExpandBookmarks] = useUserSetting(
    "expand-bookmarks-in-nav",
  );
  const [expandCollections = true, setExpandCollections] = useUserSetting(
    "expand-collections-in-nav",
  );

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

  const collectionsHeading = showExternalCollectionsSection
    ? t`Internal Collections`
    : t`Collections`;

  return (
    <ErrorBoundary>
      <SidebarContentRoot>
        <NavbarTopRow
          onItemSelect={onItemSelect}
          isDataStudio={activeTab === "data-studio"}
        />
        <NavbarTabBar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          showDataStudioTab={canAccessDataStudio}
        />

        {activeTab === "chats" && (
          <div>
            <MetabotThreadsSection onItemSelect={onItemSelect} />
            <MetabotArtifactsSection onItemSelect={onItemSelect} />
          </div>
        )}

        {activeTab === "data-studio" && (
          <div>
            <DataStudioNavSection onItemSelect={onItemSelect} />
          </div>
        )}

        {activeTab === "app" && hasError && <NavbarErrorView />}
        {activeTab === "app" && !hasError && isLoading && <NavbarLoadingView />}
        {activeTab === "app" && !hasError && !isLoading && (
          <div>
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

            <NavbarLibrarySection
              collections={collections}
              selectedId={collectionItem?.id}
              onItemSelect={onItemSelect}
            />

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

            {trashCollection && (
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
        )}
      </SidebarContentRoot>

      <AddDataModal opened={addDataModalOpened} onClose={closeAddDataModal} />
    </ErrorBoundary>
  );
}
