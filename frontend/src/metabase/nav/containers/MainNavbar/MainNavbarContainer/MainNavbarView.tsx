import dayjs from "dayjs";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useSetting, useUserSetting } from "metabase/common/hooks";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { Tree } from "metabase/components/tree";
import {
  PERSONAL_COLLECTIONS,
  getCollectionIcon,
} from "metabase/entities/collections";
import { isSmallScreen } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { WhatsNewNotification } from "metabase/nav/components/WhatsNewNotification";
import { getIsEmbedded } from "metabase/selectors/embed";
import { getIsWhiteLabeling } from "metabase/selectors/whitelabel";
import type { IconName, IconProps } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Bookmark, Collection, User } from "metabase-types/api";

import {
  CollectionMenuList,
  CollectionsMoreIcon,
  CollectionsMoreIconContainer,
  PaddedSidebarLink,
  SidebarContentRoot,
  SidebarHeading,
  SidebarHeadingWrapper,
  SidebarSection,
  TrashSidebarSection,
} from "../MainNavbar.styled";
import { SidebarCollectionLink, SidebarLink } from "../SidebarItems";
import { SidebarOnboardingSection } from "../SidebarItems/SidebarOnboardingSection";
import { trackOnboardingChecklistOpened } from "../SidebarItems/SidebarOnboardingSection/analytics";
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

  const [showOnboarding, setShowOnboarding] = useState(false);
  const instanceCreated = useSetting("instance-creation");

  useEffect(() => {
    const daysSinceCreation = dayjs().diff(dayjs(instanceCreated), "days");
    const isNewInstance = daysSinceCreation <= 30;

    if (isNewInstance) {
      setShowOnboarding(true);
    }
  }, [instanceCreated]);

  const isEmbedded = useSelector(getIsEmbedded);
  const isWhiteLabelled = useSelector(getIsWhiteLabeling);

  const showOnboardingChecklist =
    isAdmin && showOnboarding && !isEmbedded && !isWhiteLabelled;

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
            {showOnboardingChecklist && (
              <PaddedSidebarLink
                icon="learn"
                url={ONBOARDING_URL}
                isSelected={nonEntityItem?.url === ONBOARDING_URL}
                onClick={() => trackOnboardingChecklistOpened()}
              >
                {/* eslint-disable-next-line no-literal-metabase-strings -- We only show this to non-whitelabelled instances */}
                {t`How to use Metabase`}
              </PaddedSidebarLink>
            )}
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
        </div>
        <WhatsNewNotification />
        <SidebarOnboardingSection
          collections={collections}
          databases={databases}
          hasDataAccess={hasDataAccess}
          isAdmin={isAdmin}
        />
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
