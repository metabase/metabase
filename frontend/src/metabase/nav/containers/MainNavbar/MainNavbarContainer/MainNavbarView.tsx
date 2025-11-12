import { useDisclosure } from "@mantine/hooks";
import type { MouseEvent } from "react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  isExamplesCollection,
  isRootTrashCollection,
  isSyncedCollection,
} from "metabase/collections/utils";
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
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
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

  const isAtHomepageDashboard = useIsAtHomepageDashboard();
  const showSyncGroup = useSetting("remote-sync-type") === "development";

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

  const [
    regularCollections,
    trashCollection,
    examplesCollection,
    syncedCollections,
  ] = useMemo(() => {
    const synced = collections.filter(isSyncedCollection);

    const normalCollections = collections.filter((c) => {
      const isNormalCollection =
        !isRootTrashCollection(c) && !isExamplesCollection(c);
      return isNormalCollection && !isSyncedCollection(c);
    });

    if (!showSyncGroup && synced.length > 0 && normalCollections.length > 0) {
      const [root, ...rest] = normalCollections;
      const reordered = [root, ...synced, ...rest];

      return [
        reordered,
        collections.find(isRootTrashCollection),
        collections.find(isExamplesCollection),
        synced,
      ];
    }

    return [
      normalCollections,
      collections.find(isRootTrashCollection),
      collections.find(isExamplesCollection),
      synced,
    ];
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

          <SidebarSection>
            <ErrorBoundary>
              <CollectionSectionHeading
                handleCreateNewCollection={handleCreateNewCollection}
              />

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
  return (
    <Flex align="center" justify="space-between">
      <SidebarHeading>{t`Collections`}</SidebarHeading>
      <Tooltip label={t`Create a new collection`}>
        <ActionIcon
          aria-label={t`Create a new collection`}
          color="var(--mb-color-text-secondary)"
          onClick={() => {
            trackNewCollectionFromNavInitiated();
            handleCreateNewCollection();
          }}
        >
          <Icon name="add" />
        </ActionIcon>
      </Tooltip>
    </Flex>
  );
}
