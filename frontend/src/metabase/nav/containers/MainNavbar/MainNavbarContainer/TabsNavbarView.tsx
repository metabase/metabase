import { useDisclosure, useLocalStorage } from "@mantine/hooks";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { Tree } from "metabase/common/components/tree";
import { useShowOtherUsersCollections } from "metabase/common/hooks/use-show-other-users-collections";
import {
  getIsTenantUser,
  getUserCanWriteToCollections,
} from "metabase/current-user";
import { NavbarLibrarySection } from "metabase/nav/containers/MainNavbar/NavbarLibrarySection";
import { useGitIntegrationEnabled } from "metabase/nav/prototype/use-git-integration-enabled";
import { useNavVariant } from "metabase/nav/prototype/use-nav-variant";
import { PLUGIN_DATA_APPS, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { getCanAccessOnboardingPage } from "metabase/selectors/onboarding";
import { Box, Button, Divider, Flex, Icon, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isSmallScreen } from "metabase/utils/dom";
import type { IconName } from "metabase-types/api";

import { SidebarSection } from "../Sidebar";
import { SidebarCollectionLink, SidebarLink } from "../SidebarItems";
import {
  trackAddDataModalOpened,
  trackNewCollectionFromNavInitiated,
} from "../analytics";

import { AddDataModal } from "./AddDataModal";
import { AskAiConversationList } from "./AskAiConversationList";
import BookmarkList from "./BookmarkList";
import { MockExternalCollectionsList } from "./ExternalCollectionsNavSection";
import { GettingStartedSection } from "./GettingStartedSection";
import type { MainNavbarViewProps } from "./MainNavbarView";
import {
  DatabasesNavLink,
  ModelsNavLink,
  OfficialDataLinks,
  SyncedContentList,
} from "./OfficialNavSection";
import { useNavCollections } from "./use-nav-collections";

type NavTabId =
  | "home"
  | "collections"
  | "data"
  | "external-collections"
  | "explorations"
  | "data-apps"
  | "bookmarks"
  | "getting-started"
  | "ask-ai";

type NavTab = { id: NavTabId; label: string; icon: IconName };

// PROTOTYPE: the open tab is remembered across reloads and shared by the
// "Tabs" and "No top nav" variants.
const ACTIVE_TAB_KEY = "prototype-nav-active-tab";

const OTHER_USERS_COLLECTIONS_URL = Urls.otherUsersPersonalCollections();
const ASK_AI_URL = "/question/ask";

function NavTabSection({ children }: { children: ReactNode }) {
  return (
    <SidebarSection mt="md">
      <ErrorBoundary>{children}</ErrorBoundary>
    </SidebarSection>
  );
}

function EmptyTabText({ children }: { children: string }) {
  return (
    <Text c="text-secondary" fz="sm" ps="lg" pt="sm">
      {children}
    </Text>
  );
}

function DataAppsList({ onItemSelect }: { onItemSelect: () => void }) {
  const { data: allDataApps = [] } = PLUGIN_DATA_APPS.useDataApps({
    skip: false,
  });
  const dataApps = allDataApps.filter((app) => app.enabled && !app.outdated);

  if (dataApps.length === 0) {
    return <EmptyTabText>{t`No data apps yet.`}</EmptyTabText>;
  }

  return dataApps.map((app) => (
    <SidebarLink
      key={app.slug}
      icon="app"
      url={Urls.dataApp(app.slug)}
      onClick={onItemSelect}
    >
      {app.name}
    </SidebarLink>
  ));
}

/**
 * PROTOTYPE: the main nav as vertical tabs, one per section, with the active
 * section's contents listed below a divider. Used by the "Tabs" and "No top
 * nav" variants; the latter also gets the space switcher in the footer.
 */
export function TabsNavbarView({
  bookmarks,
  collections,
  selectedItems,
  hasDataAccess,
  reorderBookmarks,
  handleCreateNewCollection,
  handleCloseNavbar,
  sharedTenantCollections,
  showExternalCollectionsSection,
}: MainNavbarViewProps) {
  const { isEnabled: isGitIntegrationEnabled } = useGitIntegrationEnabled();
  const { variant } = useNavVariant();
  // PROTOTYPE: "No top nav" and "Ask AI" both have the Ask AI tab.
  const hasAskAiTab = variant === "ask-ai" || variant === "no-top-nav";
  const navigate = useNavigate();
  const canWriteToCollections = useSelector(getUserCanWriteToCollections);
  const isTenantUser = useSelector(getIsTenantUser);
  const canAccessOnboarding = useSelector(getCanAccessOnboardingPage);
  const showOtherUsersCollections = useShowOtherUsersCollections();
  const { regularCollections, trashCollection } = useNavCollections(
    collections,
    sharedTenantCollections,
  );
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

  const dataTab: NavTab = {
    id: "data",
    label: c("A noun, shown in the sidebar as a navigation link").t`Data`,
    // With git integration on, Data is the Library, so it gets its icon.
    icon: isGitIntegrationEnabled ? "repository" : "database",
  };
  const bookmarksTab: NavTab = {
    id: "bookmarks",
    label: t`Bookmarks`,
    icon: "bookmark",
  };
  const externalCollectionsTabs: NavTab[] = showExternalCollectionsSection
    ? [
        {
          id: "external-collections",
          label: t`External collections`,
          icon: "globe",
        },
      ]
    : [];

  const sectionTabs: NavTab[] = isGitIntegrationEnabled
    ? [
        { id: "home", label: t`Collections`, icon: "dashboard" },
        dataTab,
        ...externalCollectionsTabs,
        { id: "explorations", label: t`Explorations`, icon: "files" },
        bookmarksTab,
      ]
    : [
        { id: "collections", label: t`Collections`, icon: "folder" },
        ...externalCollectionsTabs,
        dataTab,
        ...(PLUGIN_DATA_APPS.isEnabled
          ? [{ id: "data-apps", label: t`Data apps`, icon: "app" } as const]
          : []),
        bookmarksTab,
        ...(canAccessOnboarding
          ? [
              {
                id: "getting-started",
                label: t`Getting Started`,
                icon: "learn",
              } as const,
            ]
          : []),
      ];
  // PROTOTYPE: the "Ask AI" variant adds Ask AI right below the first tab.
  const tabs: NavTab[] = hasAskAiTab
    ? [
        sectionTabs[0],
        { id: "ask-ai", label: t`AI conversations`, icon: "ai" },
        ...sectionTabs.slice(1),
      ]
    : sectionTabs;

  const [storedTabId, setStoredTabId] = useLocalStorage<string>({
    key: ACTIVE_TAB_KEY,
    defaultValue: tabs[0].id,
    getInitialValueInEffect: false,
  });
  // A stored tab may not exist in this mode (e.g. "Home" with git off).
  const activeTab = tabs.find((tab) => tab.id === storedTabId) ?? tabs[0];
  const isCollectionsTab =
    activeTab.id === "collections" || activeTab.id === "explorations";

  const newFolderButton =
    canWriteToCollections && !isTenantUser ? (
      <Button
        variant="subtle"
        leftSection={<Icon name="add" />}
        // Puts the icon's center on the nav's icon column.
        ml={5.5}
        mb="xs"
        onClick={() => {
          trackNewCollectionFromNavInitiated();
          handleCreateNewCollection();
        }}
      >
        {t`New folder`}
      </Button>
    ) : null;

  const collectionsList = (
    <>
      {newFolderButton}
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

  const tabContent = match(activeTab.id)
    .with("home", () => (
      <NavTabSection>
        <SyncedContentList
          collections={collections}
          selectedCollectionId={collectionItem?.id}
          onItemSelect={onItemSelect}
        />
      </NavTabSection>
    ))
    .with("collections", "explorations", () => (
      <NavTabSection>{collectionsList}</NavTabSection>
    ))
    .with("data", () => (
      <NavTabSection>
        {isGitIntegrationEnabled ? (
          <OfficialDataLinks
            collections={collections}
            selectedCollectionId={collectionItem?.id}
            nonEntityItem={nonEntityItem}
            hasDataAccess={hasDataAccess}
            onItemSelect={onItemSelect}
          />
        ) : (
          <NavbarLibrarySection
            collections={collections}
            selectedId={collectionItem?.id}
            onItemSelect={onItemSelect}
            hideHeading
          >
            <ModelsNavLink
              nonEntityItem={nonEntityItem}
              onItemSelect={onItemSelect}
            />
            {hasDataAccess && (
              <DatabasesNavLink
                nonEntityItem={nonEntityItem}
                onItemSelect={onItemSelect}
              />
            )}
          </NavbarLibrarySection>
        )}
      </NavTabSection>
    ))
    // PROTOTYPE: always the mocked list, since the real tenants plugin can't
    // drop its own heading.
    .with("external-collections", () => (
      <NavTabSection>
        <MockExternalCollectionsList />
      </NavTabSection>
    ))
    .with("data-apps", () => (
      <NavTabSection>
        <DataAppsList onItemSelect={onItemSelect} />
      </NavTabSection>
    ))
    .with("bookmarks", () => (
      <NavTabSection>
        {bookmarks.length > 0 ? (
          <BookmarkList
            bookmarks={bookmarks}
            selectedItem={cardItem ?? dashboardItem ?? collectionItem}
            onSelect={onItemSelect}
            reorderBookmarks={reorderBookmarks}
            onToggle={_.noop}
            initialState="expanded"
            hideHeading
          />
        ) : (
          <EmptyTabText>{t`Nothing bookmarked yet.`}</EmptyTabText>
        )}
      </NavTabSection>
    ))
    .with("getting-started", () => (
      <NavTabSection>
        <GettingStartedSection
          nonEntityItem={nonEntityItem}
          onAddDataModalOpen={() => {
            trackAddDataModalOpened("getting-started");
            openAddDataModal();
          }}
          hideHeading
        />
      </NavTabSection>
    ))
    .with("ask-ai", () => (
      <NavTabSection>
        <AskAiConversationList onItemSelect={onItemSelect} />
      </NavTabSection>
    ))
    .exhaustive();

  const trashTree = isCollectionsTab && trashCollection && (
    <ErrorBoundary>
      <Tree
        data={[trashCollection]}
        selectedId={collectionItem?.id}
        onSelect={onItemSelect}
        TreeNode={SidebarCollectionLink}
        role="tree"
      />
    </ErrorBoundary>
  );

  return (
    <ErrorBoundary>
      <Flex direction="column" flex={1}>
        {/* Grows, so Trash and the footer sit at the bottom. */}
        <Box flex="1 0 auto">
          <SidebarSection mb="md">
            {tabs.map((tab) => (
              <SidebarLink
                key={tab.id}
                icon={tab.icon}
                isSelected={tab.id === activeTab.id}
                onClick={() => {
                  setStoredTabId(tab.id);
                  // Ask AI also opens a new conversation; the section lists
                  // the past ones.
                  if (tab.id === "ask-ai") {
                    navigate(ASK_AI_URL);
                    onItemSelect();
                  }
                }}
              >
                {tab.label}
              </SidebarLink>
            ))}
          </SidebarSection>
          <Divider />
          {tabContent}
        </Box>

        <SidebarSection>
          {trashTree}
          {/* Git branch controls; the space switcher sits by the logo. */}
          {variant === "no-top-nav" && <PLUGIN_REMOTE_SYNC.AppBarControls />}
        </SidebarSection>
      </Flex>

      <AddDataModal opened={addDataModalOpened} onClose={closeAddDataModal} />
    </ErrorBoundary>
  );
}
