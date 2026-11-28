import { useDisclosure, useLocalStorage } from "@mantine/hooks";
import type { CSSProperties, ReactNode } from "react";
import { useCallback } from "react";
import { match } from "ts-pattern";
import { c, t } from "ttag";
import _ from "underscore";

import type { CollectionTreeItem } from "metabase/common/collections/utils";
import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { Tree } from "metabase/common/components/tree";
import { useShowOtherUsersCollections } from "metabase/common/hooks/use-show-other-users-collections";
import {
  getIsTenantUser,
  getUserCanWriteToCollections,
  getUserId,
} from "metabase/current-user";
import { AreaTabGroupHeading } from "metabase/nav/components/AreaLayout";
import { NavbarLibrarySection } from "metabase/nav/containers/MainNavbar/NavbarLibrarySection";
import { useGitIntegrationEnabled } from "metabase/nav/prototype/use-git-integration-enabled";
import {
  isModernNav,
  useNavVariant,
} from "metabase/nav/prototype/use-nav-variant";
import { PLUGIN_DATA_APPS, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { getCanAccessOnboardingPage } from "metabase/selectors/onboarding";
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Flex,
  Icon,
  Text,
  Tooltip,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { isSmallScreen } from "metabase/utils/dom";
import type { Collection, IconName } from "metabase-types/api";

import { SidebarSection } from "../Sidebar";
import { SidebarCollectionLink, SidebarLink } from "../SidebarItems";
import SidebarItemsS from "../SidebarItems/SidebarItems.module.css";
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
  MetricsNavLink,
  ModelsNavLink,
  OfficialDataLinks,
  SyncedContentList,
  findLibrarySection,
  libraryHasMetrics,
} from "./OfficialNavSection";
import { useNavCollections } from "./use-nav-collections";

type NavTabId =
  | "home"
  | "collections"
  | "metrics"
  | "datasets"
  | "data-sources"
  | "models"
  | "data"
  | "personal"
  | "external-collections"
  | "explorations"
  | "data-apps"
  | "bookmarks"
  | "getting-started"
  | "ask-ai";

type NavTab = { id: NavTabId; label: string; icon: IconName };

/** A run of tabs, under a heading in "Modern nav - B" and "- D". */
type NavTabGroup = { heading?: string; tabs: NavTab[] };

// PROTOTYPE: the open tab is remembered across reloads and shared by the
// "Tabs" and "Modern nav" variants.
const ACTIVE_TAB_KEY = "prototype-nav-active-tab";

const OTHER_USERS_COLLECTIONS_URL = Urls.otherUsersPersonalCollections();
const ASK_AI_URL = "/question/ask";
const BROWSE_METRICS_URL = "/browse/metrics";
const BROWSE_DATABASES_URL = "/browse/databases";
const BROWSE_MODELS_URL = "/browse/models";

// PROTOTYPE: the rows under the tabs use the secondary icon color (hovered
// and selected rows go back to brand), so they read apart from the tabs.
const SUB_NAV_STYLE = {
  "--nav-item-icon-color": "var(--mb-color-icon-secondary)",
} as CSSProperties;

function NavTabSection({ children }: { children: ReactNode }) {
  return (
    <SidebarSection mt="md" style={SUB_NAV_STYLE}>
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
 * section's contents listed below a divider. Used by the "Tabs" and "Modern
 * nav" variants; "Modern nav - B" groups its tabs under "Official" and
 * "Other" headings.
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
  // PROTOTYPE: until the Library holds a metric, Metrics links to Browse
  // metrics.
  const hasLibraryMetrics = libraryHasMetrics(collections);
  const { isEnabled: isGitIntegrationEnabled } = useGitIntegrationEnabled();
  const { variant } = useNavVariant();
  const isGrouped = variant === "modern-nav-b";
  // PROTOTYPE: "Modern nav - C" renames and reorders the git-on tabs, and
  // orders the git-off ones to match.
  const isVariantC = variant === "modern-nav-c";
  const isVariantCWithGit = isVariantC && isGitIntegrationEnabled;
  const isVariantD = variant === "modern-nav-d";
  // PROTOTYPE: "Modern nav - D" has C's Data tab (with git: Official/Other
  // subheadings; without: Databases, Metrics, Models).
  const hasVariantCDataTab = isVariantC || isVariantD;
  // The Library's Metrics and Datasets sections, for B's and D's tabs of
  // those names.
  const metricsSection = findLibrarySection(collections, "library-metrics");
  const datasetsSection = findLibrarySection(collections, "library-data");
  const navigate = useNavigate();
  const canWriteToCollections = useSelector(getUserCanWriteToCollections);
  const isTenantUser = useSelector(getIsTenantUser);
  const currentUserId = useSelector(getUserId);
  const canAccessOnboarding = useSelector(getCanAccessOnboardingPage);
  const showOtherUsersCollections = useShowOtherUsersCollections();
  const { regularCollections, trashCollection } = useNavCollections(
    collections,
    sharedTenantCollections,
  );
  // PROTOTYPE: D lists your personal collection under its own Personal tab,
  // so its Shared tree leaves it out.
  const personalCollection = regularCollections.find(
    (collection) =>
      collection.personal_owner_id != null &&
      collection.personal_owner_id === currentUserId,
  );
  const sharedCollections = isVariantD
    ? regularCollections.filter(
        (collection) => collection !== personalCollection,
      )
    : regularCollections;
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
        { id: "explorations", label: t`Saved`, icon: "files" },
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
  // PROTOTYPE: AI conversations takes Data's spot, and Data takes the one
  // right below the first tab.
  const dataTabIndex = sectionTabs.findIndex((tab) => tab.id === "data");
  const aiConversationsTab: NavTab = {
    id: "ask-ai",
    label: t`AI conversations`,
    icon: "ai",
  };
  const tabs: NavTab[] = isVariantCWithGit
    ? // PROTOTYPE: C puts the collections first (Official, then the rest as
      // "Shared", then External), then Data and AI conversations, with
      // Bookmarks last.
      [
        { ...sectionTabs[0], label: t`Official`, icon: "folder_bookmark" },
        { id: "explorations", label: t`Shared`, icon: "folder" },
        ...externalCollectionsTabs,
        { ...dataTab, icon: "grid_2x2_check" },
        aiConversationsTab,
        bookmarksTab,
      ]
    : isVariantC
      ? // PROTOTYPE: C without git puts Getting Started first, then follows
        // its git-on order (collections, External, Data, AI conversations,
        // Bookmarks), with Data apps right after Collections.
        [
          ...sectionTabs.filter((tab) => tab.id === "getting-started"),
          sectionTabs[0],
          ...sectionTabs.filter((tab) => tab.id === "data-apps"),
          ...externalCollectionsTabs,
          { ...dataTab, icon: "grid_2x2" },
          aiConversationsTab,
          bookmarksTab,
        ]
      : [
          sectionTabs[0],
          dataTab,
          ...sectionTabs
            .slice(1)
            .map((tab, index) =>
              index + 1 === dataTabIndex ? aiConversationsTab : tab,
            ),
        ];

  // PROTOTYPE: "Modern nav - D" groups its tabs under Collections and More.
  // Collections splits Official and Shared (with git), plus your Personal
  // collection on its own; More starts with C's Data tab. Tabs that only show
  // in some setups (External, Data apps, Getting Started) join the group they
  // fit.
  function getVariantDTabGroups(): NavTabGroup[] {
    const externalTabs = externalCollectionsTabs.map((tab) => ({
      ...tab,
      label: t`External`,
    }));
    const personalTabs: NavTab[] = personalCollection
      ? [{ id: "personal", label: t`Personal`, icon: "person" }]
      : [];
    const collectionTabs: NavTab[] = isGitIntegrationEnabled
      ? [
          { id: "home", label: t`Official`, icon: "folder_bookmark" },
          ...externalTabs,
          { id: "explorations", label: t`Shared`, icon: "folder" },
          ...personalTabs,
        ]
      : [
          { id: "collections", label: t`Shared`, icon: "folder" },
          ...externalTabs,
          ...personalTabs,
        ];
    return [
      { heading: t`Collections`, tabs: collectionTabs },
      {
        heading: t`More`,
        tabs: [
          {
            ...dataTab,
            icon: isGitIntegrationEnabled ? "grid_2x2_check" : "grid_2x2",
          },
          aiConversationsTab,
          bookmarksTab,
          ...sectionTabs.filter(
            (tab) => tab.id === "data-apps" || tab.id === "getting-started",
          ),
        ],
      },
    ];
  }

  // PROTOTYPE: "Modern nav - B" splits the tabs into Official (Collections
  // and the Library's Metrics and Datasets) and Other (the rest, with Data
  // reduced to Databases and Models). Tabs that only show in some setups
  // (External collections, Data apps, Getting Started) join Other. Without git
  // there's nothing official: one ungrouped list, Getting Started first, Data
  // apps under Collections, Data holding the Library, AI conversations last.
  const isGroupedWithGit = isGrouped && isGitIntegrationEnabled;
  const variantBWithoutGitTabs: NavTab[] = [
    ...sectionTabs.filter((tab) => tab.id === "getting-started"),
    sectionTabs[0],
    ...sectionTabs.filter((tab) => tab.id === "data-apps"),
    ...externalCollectionsTabs,
    dataTab,
    bookmarksTab,
    aiConversationsTab,
  ];
  const tabGroups: NavTabGroup[] = isGroupedWithGit
    ? [
        {
          heading: t`Official`,
          tabs: [
            // Keeps its "Collections" label; the heading says it's official.
            { ...sectionTabs[0], icon: "folder_bookmark" },
            { id: "metrics", label: t`Metrics`, icon: "metric" },
            ...(datasetsSection
              ? [{ id: "datasets", label: t`Datasets`, icon: "table" } as const]
              : []),
          ],
        },
        {
          heading: t`Other`,
          tabs: [
            // Was "Saved".
            { id: "explorations", label: t`Collections`, icon: "folder" },
            ...externalCollectionsTabs,
            { ...dataTab, icon: "database" },
            aiConversationsTab,
            bookmarksTab,
            ...sectionTabs.filter(
              (tab) => tab.id === "data-apps" || tab.id === "getting-started",
            ),
          ],
        },
      ]
    : isGrouped
      ? [{ tabs: variantBWithoutGitTabs }]
      : variant === "modern-nav-d"
        ? getVariantDTabGroups()
        : [{ tabs }];
  const allTabs = tabGroups.flatMap((group) => group.tabs);

  const [storedTabId, setStoredTabId] = useLocalStorage<string>({
    key: ACTIVE_TAB_KEY,
    defaultValue: allTabs[0].id,
    getInitialValueInEffect: false,
  });
  // A stored tab may not exist in this mode (e.g. "Home" with git off).
  const activeTab = allTabs.find((tab) => tab.id === storedTabId) ?? allTabs[0];
  const isCollectionsTab =
    activeTab.id === "collections" || activeTab.id === "explorations";

  const getTabUrl = (id: NavTabId): string | undefined =>
    match(id)
      .with("ask-ai", () => ASK_AI_URL)
      .with("metrics", () =>
        hasLibraryMetrics && metricsSection
          ? Urls.collection(metricsSection)
          : BROWSE_METRICS_URL,
      )
      .with("datasets", () =>
        datasetsSection ? Urls.collection(datasetsSection) : undefined,
      )
      .with("data-sources", () => BROWSE_DATABASES_URL)
      .with("models", () => BROWSE_MODELS_URL)
      .with("personal", () =>
        personalCollection ? Urls.collection(personalCollection) : undefined,
      )
      .otherwise(() => undefined);

  // Nothing to list (and no divider) when the section has no subfolders.
  const renderLibrarySubfolders = (section?: CollectionTreeItem) =>
    section && section.children.length > 0 ? (
      <NavTabSection>
        <Tree
          data={section.children}
          selectedId={collectionItem?.id}
          onSelect={onItemSelect}
          TreeNode={SidebarCollectionLink}
          role="tree"
          rightSection={(item) =>
            typeof item.id === "number" && (
              <PLUGIN_REMOTE_SYNC.ChangesBadge
                target={{ type: "collection", id: item.id }}
              />
            )
          }
        />
      </NavTabSection>
    ) : null;

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
        {/* PROTOTYPE: the "Modern nav" variants say "collection". */}
        {isModernNav(variant) ? t`New collection` : t`New folder`}
      </Button>
    ) : null;

  // PROTOTYPE: the "Modern nav" variants reach other users' personal
  // collections from a button on your own personal collection's row, instead
  // of a row of their own.
  const isOtherUsersButtonOnRow = isModernNav(variant);
  const otherUsersCollectionsButton = (
    <Tooltip label={t`Other users' personal collections`}>
      <ActionIcon
        variant="subtle"
        size="sm"
        aria-label={t`Other users' personal collections`}
        onClick={(event) => {
          // The row is a link to your own collection; this goes elsewhere.
          event.preventDefault();
          event.stopPropagation();
          navigate(OTHER_USERS_COLLECTIONS_URL);
          onItemSelect();
        }}
      >
        <Icon name="group" />
      </ActionIcon>
    </Tooltip>
  );

  const collectionsList = (
    <>
      {newFolderButton}
      <Tree
        data={sharedCollections}
        selectedId={collectionItem?.id}
        onSelect={onItemSelect}
        TreeNode={SidebarCollectionLink}
        role="tree"
        aria-label="collection-tree"
        rightSection={(item) => {
          // Unjustified type cast. FIXME
          const collection = item as unknown as Collection;
          const isOwnPersonalCollection =
            collection.personal_owner_id != null &&
            collection.personal_owner_id === currentUserId;
          return (
            <>
              {typeof item.id === "number" && (
                <PLUGIN_REMOTE_SYNC.ChangesBadge
                  target={{ type: "collection", id: item.id }}
                />
              )}
              {isOtherUsersButtonOnRow &&
                showOtherUsersCollections &&
                isOwnPersonalCollection &&
                otherUsersCollectionsButton}
            </>
          );
        }}
      />
      {showOtherUsersCollections && !isOtherUsersButtonOnRow && (
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
    // D's Personal: the tab opens your personal collection, and lists its
    // subfolders, plus the way to other users' personal collections.
    .with("personal", () => {
      const subfolders = personalCollection?.children ?? [];
      if (subfolders.length === 0 && !showOtherUsersCollections) {
        return null;
      }
      return (
        <NavTabSection>
          <Tree
            data={subfolders}
            selectedId={collectionItem?.id}
            onSelect={onItemSelect}
            TreeNode={SidebarCollectionLink}
            role="tree"
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
        </NavTabSection>
      );
    })
    // The Library's sections: the tab opens the section, and lists its
    // subfolders. Without Library metrics, Metrics opens Browse metrics.
    .with("metrics", () =>
      hasLibraryMetrics ? renderLibrarySubfolders(metricsSection) : null,
    )
    .with("datasets", () => renderLibrarySubfolders(datasetsSection))
    // Link-only tabs: their page is the content.
    .with("data-sources", "models", () => null)
    // B's Data (with git) holds what's left once Metrics and Datasets have
    // their tabs.
    .with("data", () => (
      <NavTabSection>
        {isGroupedWithGit ? (
          <>
            {hasDataAccess && (
              <DatabasesNavLink
                nonEntityItem={nonEntityItem}
                onItemSelect={onItemSelect}
              />
            )}
            <ModelsNavLink
              nonEntityItem={nonEntityItem}
              onItemSelect={onItemSelect}
            />
          </>
        ) : isGitIntegrationEnabled ? (
          <OfficialDataLinks
            collections={collections}
            selectedCollectionId={collectionItem?.id}
            nonEntityItem={nonEntityItem}
            hasDataAccess={hasDataAccess}
            onItemSelect={onItemSelect}
            withSubheadings={isGitIntegrationEnabled && hasVariantCDataTab}
          />
        ) : hasVariantCDataTab ? (
          // PROTOTYPE: "Modern nav - C" without git puts Databases first,
          // leaves out the Library's Datasets, and its Metrics always opens
          // Browse metrics (which lists the metrics outside synced
          // collections).
          <>
            {hasDataAccess && (
              <DatabasesNavLink
                nonEntityItem={nonEntityItem}
                onItemSelect={onItemSelect}
              />
            )}
            <NavbarLibrarySection
              collections={collections}
              selectedId={collectionItem?.id}
              onItemSelect={onItemSelect}
              hideHeading
              hideMetrics
              hideDatasets
            >
              <MetricsNavLink
                nonEntityItem={nonEntityItem}
                onItemSelect={onItemSelect}
              />
              <ModelsNavLink
                nonEntityItem={nonEntityItem}
                onItemSelect={onItemSelect}
              />
            </NavbarLibrarySection>
          </>
        ) : (
          <NavbarLibrarySection
            collections={collections}
            selectedId={collectionItem?.id}
            onItemSelect={onItemSelect}
            hideHeading
            hideMetrics={!hasLibraryMetrics}
          >
            {!hasLibraryMetrics && (
              <MetricsNavLink
                nonEntityItem={nonEntityItem}
                onItemSelect={onItemSelect}
              />
            )}
            {hasDataAccess && (
              <DatabasesNavLink
                nonEntityItem={nonEntityItem}
                onItemSelect={onItemSelect}
              />
            )}
            <ModelsNavLink
              nonEntityItem={nonEntityItem}
              onItemSelect={onItemSelect}
            />
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
          {tabGroups.map((group, index) => (
            <SidebarSection key={group.heading ?? index} mb="md">
              {group.heading && (
                // Data Studio's group heading, its text lined up with the
                // tabs' icons (link padding + icon box padding).
                <AreaTabGroupHeading ps="1.125rem">
                  {group.heading}
                </AreaTabGroupHeading>
              )}
              {group.tabs.map((tab) => (
                <SidebarLink
                  key={tab.id}
                  icon={tab.icon}
                  isSelected={tab.id === activeTab.id}
                  className={
                    tab.id === activeTab.id
                      ? SidebarItemsS.tabSelected
                      : undefined
                  }
                  onClick={() => {
                    setStoredTabId(tab.id);
                    // Some tabs open a page too: Ask AI a new conversation
                    // (the section lists the past ones), and B's Library tabs
                    // their section (the section lists its subfolders).
                    const url = getTabUrl(tab.id);
                    if (url) {
                      navigate(url);
                      onItemSelect();
                    }
                  }}
                >
                  {tab.label}
                </SidebarLink>
              ))}
            </SidebarSection>
          ))}
          {tabContent && (
            <>
              <Divider />
              {tabContent}
            </>
          )}
        </Box>

        <SidebarSection>
          {trashTree}
          {/* Git branch controls; the space switcher sits by the logo. */}
          {isModernNav(variant) && <PLUGIN_REMOTE_SYNC.AppBarControls />}
        </SidebarSection>
      </Flex>

      <AddDataModal opened={addDataModalOpened} onClose={closeAddDataModal} />
    </ErrorBoundary>
  );
}
