import type { MouseEvent } from "react";
import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useHasTokenFeature, useUserSetting } from "metabase/common/hooks";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { Tree } from "metabase/components/tree";
import {
  PERSONAL_COLLECTIONS,
  getCollectionIcon,
} from "metabase/entities/collections";
import { OnboardingDismissedToast } from "metabase/home/components/Onboarding";
import {
  getCanAccessOnboardingPage,
  getIsNewInstance,
} from "metabase/home/selectors";
import { isSmallScreen } from "metabase/lib/dom";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { WhatsNewNotification } from "metabase/nav/components/WhatsNewNotification";
import { addUndo } from "metabase/redux/undo";
import { getHasOwnDatabase } from "metabase/selectors/data";
import { getSetting } from "metabase/selectors/settings";
import { Icon, type IconName, type IconProps, Tooltip } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, User } from "metabase-types/api";

import {
  CollectionMenuList,
  CollectionsMoreIcon,
  CollectionsMoreIconContainer,
  PaddedSidebarLink,
  PaddedSidebarLinkDismissible,
  SidebarContentRoot,
  SidebarHeading,
  SidebarHeadingWrapper,
  SidebarSection,
  TrashSidebarSection,
} from "../MainNavbar.styled";
import { SidebarCollectionLink, SidebarLink } from "../SidebarItems";
import { AddDatabase } from "../SidebarItems/AddDatabase";
import { DwhUploadCSV } from "../SidebarItems/DwhUploadCSV/DwhUploadCSV";
import { trackOnboardingChecklistOpened } from "../analytics";
import type { SelectedItem } from "../types";

import BookmarkList from "./BookmarkList";
import { BrowseNavSection } from "./BrowseNavSection";

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
  currentUser,
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
  const [isOnboardingLinkDismissed, setIsOnboardingLinkDismissed] =
    useUserSetting("dismissed-onboarding-sidebar-link");

  const isAtHomepageDashboard = useIsAtHomepageDashboard();

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

  const [[trashCollection], collectionsWithoutTrash] = useMemo(
    () => _.partition(collections, c => c.type === "trash"),
    [collections],
  );

  const ONBOARDING_URL = "/getting-started";
  const isNewInstance = useSelector(getIsNewInstance);
  const canAccessOnboarding = useSelector(getCanAccessOnboardingPage);
  const showOnboardingLink =
    !isOnboardingLinkDismissed && isNewInstance && canAccessOnboarding;
  const isOnboardingPageSelected = nonEntityItem?.url === ONBOARDING_URL;

  const dispatch = useDispatch();

  const dismissOnboardingLink = () => {
    setIsOnboardingLinkDismissed(true);

    if (isOnboardingPageSelected) {
      dispatch(push("/"));
    }

    dispatch(
      addUndo({
        icon: "gear",
        message: <OnboardingDismissedToast />,
      }),
    );
  };

  // Instances with DWH enabled already have uploads enabled by default.
  // It is not possible to turn the uploads off, nor to delete the attached database.
  const hasAttachedDWHFeature = useHasTokenFeature("attached_dwh");

  const uploadDbId = useSelector(
    state => getSetting(state, "uploads-settings")?.db_id,
  );

  const rootCollection = collections.find(
    c => c.id === "root" || c.id === null,
  );
  const canCurateRootCollection = rootCollection?.can_write;
  const canUploadToDatabase = databases
    ?.find(db => db.id === uploadDbId)
    ?.canUpload();

  /**
   * the user must have:
   *   - "write" permissions for the root collection AND
   *   - "upload" permissions for the attached DWH
   */
  const canUpload = canCurateRootCollection && canUploadToDatabase;
  const showUploadCSVButton = hasAttachedDWHFeature && canUpload;

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
            {showOnboardingLink && (
              <PaddedSidebarLinkDismissible
                icon="learn"
                right={
                  <Tooltip label={t`Hide page`} offset={16} position="right">
                    <Icon
                      className="dismiss"
                      name="eye_crossed_out"
                      onClick={dismissOnboardingLink}
                    />
                  </Tooltip>
                }
                url={ONBOARDING_URL}
                isSelected={isOnboardingPageSelected}
                onClick={() => trackOnboardingChecklistOpened()}
              >
                {/* eslint-disable-next-line no-literal-metabase-strings -- We only show this to non-whitelabelled instances */}
                {t`How to use Metabase`}
              </PaddedSidebarLinkDismissible>
            )}
            {showUploadCSVButton && <DwhUploadCSV />}
          </SidebarSection>

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
                currentUser={currentUser}
                handleCreateNewCollection={handleCreateNewCollection}
              />
              <Tree
                data={collectionsWithoutTrash}
                selectedId={collectionItem?.id}
                onSelect={onItemSelect}
                TreeNode={SidebarCollectionLink}
                role="tree"
                aria-label="collection-tree"
              />
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
