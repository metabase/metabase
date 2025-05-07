import { useDisclosure } from "@mantine/hooks";
import type { MouseEvent } from "react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  isExamplesCollection,
  isLibraryCollection,
  isRootTrashCollection,
  isSyncedCollection,
} from "metabase/collections/utils";
import CollapseSection from "metabase/common/components/CollapseSection";
import { Tree } from "metabase/common/components/tree";
import { useSetting, useUserSetting } from "metabase/common/hooks";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";
import type { CollectionTreeItem } from "metabase/entities/collections";
import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/home/selectors";
import { isSmallScreen } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { WhatsNewNotification } from "metabase/nav/components/WhatsNewNotification";
import {
  PLUGIN_DATA_STUDIO,
  PLUGIN_REMOTE_SYNC,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import { getUserCanWriteToCollections } from "metabase/selectors/user";
import { ActionIcon, Flex, Icon, Tooltip } from "metabase/ui";
import type { Bookmark } from "metabase-types/api";

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
  isAdmin: boolean;
  isOpen: boolean;
  bookmarks: Bookmark[];
  hasDataAccess: boolean;
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
  }) => Promise<any>;
};
const OTHER_USERS_COLLECTIONS_URL = Urls.otherUsersPersonalCollections();

export function MainNavbarView({
  isAdmin,
  bookmarks,
  collections,
  selectedItems,
  hasDataAccess,
  reorderBookmarks,
  handleCreateNewCollection,
  handleCloseNavbar,
}: Props) {
  const [expandBookmarks = true, setExpandBookmarks] = useUserSetting(
    "expand-bookmarks-in-nav",
  );
  const [expandCollections = true, setExpandCollections] = useUserSetting(
    "expand-collections-in-nav",
  );

  const isAtHomepageDashboard = useIsAtHomepageDashboard();
  const showSyncGroup = useSetting("remote-sync-type") === "read-write";

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

  const {
    regularCollections,
    trashCollection,
    examplesCollection,
    syncedCollections,
  } = useMemo(() => {
    const syncedCollections = collections.filter(isSyncedCollection);
    const trashCollection = collections.find(isRootTrashCollection);
    const examplesCollection = collections.find(isExamplesCollection);

    const regularCollections = collections.filter((c) => {
      const isNormalCollection =
        !isRootTrashCollection(c) && !isExamplesCollection(c);
      return (
        isNormalCollection && !isSyncedCollection(c) && !isLibraryCollection(c)
      );
    });

    const shouldMoveSyncedCollectionToTop =
      !showSyncGroup &&
      syncedCollections.length > 0 &&
      regularCollections.length > 0;

    const collectionsByCategory = {
      trashCollection,
      examplesCollection,
      syncedCollections,
    };

    if (shouldMoveSyncedCollectionToTop) {
      const [root, ...rest] = regularCollections;
      const reordered = [root, ...syncedCollections, ...rest];

      return {
        ...collectionsByCategory,
        regularCollections: reordered,
      };
    }

    return {
      ...collectionsByCategory,
      regularCollections,
    };
  }, [collections, showSyncGroup]);

  const isNewInstance = useSelector(getIsNewInstance);
  const canAccessOnboarding = useSelector(getCanAccessOnboardingPage);
  const shouldDisplayGettingStarted = isNewInstance && canAccessOnboarding;

  const activeUsersCount = useSetting("active-users-count");
  const areThereOtherUsers = (activeUsersCount ?? 0) > 1;
  const showOtherUsersCollections = isAdmin && areThereOtherUsers;

  return (
    <ErrorBoundary>
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

          {showSyncGroup && (
            <PLUGIN_REMOTE_SYNC.SyncedCollectionsSidebarSection
              onItemSelect={onItemSelect}
              selectedId={collectionItem?.id}
              syncedCollections={syncedCollections}
            />
          )}

          <PLUGIN_TENANTS.MainNavSharedCollections />

          {PLUGIN_DATA_STUDIO.isEnabled && (
            <PLUGIN_DATA_STUDIO.NavbarLibrarySection
              collections={collections}
              selectedId={collectionItem?.id}
              onItemSelect={onItemSelect}
            />
          )}

          <SidebarSection>
            <ErrorBoundary>
              <CollapseSection
                header={
                  <CollectionSectionHeading
                    handleCreateNewCollection={handleCreateNewCollection}
                  />
                }
                initialState={expandCollections ? "expanded" : "collapsed"}
                iconPosition="right"
                iconSize={8}
                onToggle={setExpandCollections}
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
                />
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
        <div>
          <WhatsNewNotification />
        </div>
      </SidebarContentRoot>

      <AddDataModal opened={addDataModalOpened} onClose={closeAddDataModal} />
    </ErrorBoundary>
  );
}

interface CollectionSectionHeadingProps {
  handleCreateNewCollection: () => void;
}

function CollectionSectionHeading({
  handleCreateNewCollection,
}: CollectionSectionHeadingProps) {
  const canWriteToCollection = useSelector(getUserCanWriteToCollections);

  return (
    <Flex align="center" justify="space-between">
      <SidebarHeading>{t`Collections`}</SidebarHeading>
      {canWriteToCollection && (
        <Tooltip label={t`Create a new collection`}>
          <ActionIcon
            data-testid="navbar-new-collection-button"
            aria-label={t`Create a new collection`}
            color="text-medium"
            onClick={() => {
              trackNewCollectionFromNavInitiated();
              handleCreateNewCollection();
            }}
          >
            <Icon name="add" />
          </ActionIcon>
        </Tooltip>
      )}
    </Flex>
  );
}
