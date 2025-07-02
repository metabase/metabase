import type { MouseEvent } from "react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import {
  isExamplesCollection,
  isRootTrashCollection,
} from "metabase/collections/utils";
import { Tree } from "metabase/common/components/tree";
import { useHasTokenFeature, useUserSetting } from "metabase/common/hooks";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";
import { getIsNewInstance } from "metabase/home/selectors";
import { isSmallScreen } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { WhatsNewNotification } from "metabase/nav/components/WhatsNewNotification";
import { getHasOwnDatabase } from "metabase/selectors/data";
import { getSetting } from "metabase/selectors/settings";
import {
  ActionIcon,
  Flex,
  Icon,
  type IconName,
  type IconProps,
  Tooltip,
} from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection } from "metabase-types/api";

import {
  PaddedSidebarLink,
  SidebarContentRoot,
  SidebarHeading,
  SidebarSection,
  TrashSidebarSection,
} from "../MainNavbar.styled";
import { SidebarCollectionLink } from "../SidebarItems";
import { AddDatabase } from "../SidebarItems/AddDatabase";
import { DwhUploadMenu } from "../SidebarItems/DwhUpload";
import { trackNewCollectionFromNavInitiated } from "../analytics";
import type { SelectedItem } from "../types";

import BookmarkList from "./BookmarkList";
import { BrowseNavSection } from "./BrowseNavSection";
import { GettingStartedSection } from "./GettingStartedSection";

interface CollectionTreeItem extends Collection {
  icon: IconName | IconProps;
  children: CollectionTreeItem[];
}
type Props = {
  isAdmin: boolean;
  isOpen: boolean;
  bookmarks: Bookmark[];
  hasDataAccess: boolean;
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
  }) => Promise<any>;
};
const OTHER_USERS_COLLECTIONS_URL = Urls.otherUsersPersonalCollections();

export function MainNavbarView({
  isAdmin,
  bookmarks,
  collections,
  databases,
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

  const [regularCollections, trashCollection, examplesCollection] =
    useMemo(() => {
      return [
        collections.filter(
          (c) => !isRootTrashCollection(c) && !isExamplesCollection(c),
        ),
        collections.find(isRootTrashCollection),
        collections.find(isExamplesCollection),
      ];
    }, [collections]);

  const isNewInstance = useSelector(getIsNewInstance);

  // Instances with DWH enabled already have uploads enabled by default.
  // It is not possible to turn the uploads off, nor to delete the attached database.
  const hasAttachedDWHFeature = useHasTokenFeature("attached_dwh");

  const uploadDbId = useSelector(
    (state) => getSetting(state, "uploads-settings")?.db_id,
  );

  const rootCollection = collections.find(
    (c) => c.id === "root" || c.id === null,
  );
  const canCurateRootCollection = rootCollection?.can_write;
  const canUploadToDatabase = databases
    ?.find((db) => db.id === uploadDbId)
    ?.canUpload();

  /**
   * the user must have:
   *   - "write" permissions for the root collection AND
   *   - "upload" permissions for the attached DWH
   */
  const canUpload = canCurateRootCollection && canUploadToDatabase;
  const showUploadMenu = hasAttachedDWHFeature && canUpload;

  const isAdditionalDatabaseAdded = getHasOwnDatabase(databases);
  const showAddDatabaseButton = isAdmin && !isAdditionalDatabaseAdded;

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

            {showUploadMenu && <DwhUploadMenu />}
          </SidebarSection>

          {isNewInstance && (
            <SidebarSection>
              <ErrorBoundary>
                <GettingStartedSection nonEntityItem={nonEntityItem}>
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
              {isAdmin && (
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
          {showAddDatabaseButton && (
            <SidebarSection>
              <ErrorBoundary>
                <AddDatabase />
              </ErrorBoundary>
            </SidebarSection>
          )}
        </div>
        <WhatsNewNotification />
      </SidebarContentRoot>
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
          color="var(--mb-color-text-medium)"
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
