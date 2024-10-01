import type { MouseEvent } from "react";
import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useUserSetting } from "metabase/common/hooks";
import { useHasTokenFeature } from "metabase/common/hooks/use-has-token-feature";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { Tree } from "metabase/components/tree";
import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import {
  PERSONAL_COLLECTIONS,
  getCollectionIcon,
} from "metabase/entities/collections";
import { isSmallScreen } from "metabase/lib/dom";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { WhatsNewNotification } from "metabase/nav/components/WhatsNewNotification";
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";
import { UploadCSV } from "metabase/nav/containers/MainNavbar/SidebarItems/UploadCSV";
import { getLearnUrl, getSetting } from "metabase/selectors/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  Box,
  Button,
  Group,
  Icon,
  type IconName,
  type IconProps,
  Menu,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { Bookmark, Collection, User } from "metabase-types/api";

import {
  AddYourOwnDataLink,
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
  hasOwnDatabase: boolean;
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
const ADD_YOUR_OWN_DATA_URL = "/admin/databases/create";

function MainNavbarView({
  isAdmin,
  currentUser,
  bookmarks,
  collections,
  hasOwnDatabase,
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

  // Can upload CSVs if
  // - properties.token_features.attached_dwh === true
  // - properties.uploads-settings.db_id exists
  // - retrieve collection using properties.uploads-settings.db_id
  const hasAttachedDWHFeature = useHasTokenFeature("attached_dwh");
  const uploadDbId = useSelector(
    state => getSetting(state, "uploads-settings")?.db_id,
  );
  const rootCollection = collections.find(
    ({ id, can_write }) => (id === null || id === "root") && can_write,
  );

  const [[trashCollection], collectionsWithoutTrash] = useMemo(
    () => _.partition(collections, c => c.type === "trash"),
    [collections],
  );

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

            {hasAttachedDWHFeature && uploadDbId && rootCollection && (
              <UploadCSV collection={rootCollection} />
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
              {hasDataAccess && (
                <>
                  {!hasOwnDatabase && isAdmin && (
                    <AddYourOwnDataLink
                      icon="add"
                      url={ADD_YOUR_OWN_DATA_URL}
                      isSelected={nonEntityItem?.url?.startsWith(
                        ADD_YOUR_OWN_DATA_URL,
                      )}
                      onClick={onItemSelect}
                    >
                      {t`Add your own data`}
                    </AddYourOwnDataLink>
                  )}
                </>
              )}
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
        <SidebarOnboardingSection />
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

function SidebarOnboardingSection() {
  const applicationName = useSelector(getApplicationName);

  return (
    <Box m={0} bottom={0} pos="fixed" w={NAV_SIDEBAR_WIDTH} bg="bg-white">
      <Box px="xl" py="md">
        <Group spacing="sm">
          <Icon name="learn" />
          {/*eslint-disable-next-line no-unconditional-metabase-links-render -- This link is only temporary. It will be replaced with an internal link to a page. */}
          <ExternalLink href={getLearnUrl()}>
            <Text fz="md" weight={600}>{t`How to use ${applicationName}`}</Text>
          </ExternalLink>
        </Group>
      </Box>
      <Box
        px="xl"
        py="md"
        style={{
          borderTop: `1px solid var(--mb-color-border)`,
        }}
      >
        <Text
          fz="sm"
          mb="md"
        >{t`Start by adding your data. Connect to a database or upload a CSV file.`}</Text>
        <Menu position="right-end" shadow="md">
          <Menu.Target>
            <Button
              leftIcon={<Icon name="add_data" />}
              fullWidth
              // compact
            >{t`Add data`}</Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item icon={<Icon name="database" />}>
              <Link to="/admin/databases/create">
                <Stack spacing="xs">
                  <Title order={4}>{t`Add a database`}</Title>
                  <Text size="sm">{t`PostgreSQL, MySQL, Snowflake, ...`}</Text>
                </Stack>
              </Link>
            </Menu.Item>
            <Menu.Item icon={<Icon name="table2" />}>
              <Stack spacing="xs">
                <Title order={4}>{t`Upload a spreadsheet`}</Title>
                <Text size="sm">{t`.csv, .tsv (50 MB max)`}</Text>
              </Stack>
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Box>
    </Box>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MainNavbarView;
