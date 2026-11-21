import { useMemo } from "react";
import { c, t } from "ttag";

import type { CollectionTreeItem } from "metabase/common/collections/utils";
import { isLibraryCollection } from "metabase/common/collections/utils";
import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Tree } from "metabase/common/components/tree";
import { getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_DATA_APPS, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Button, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  Collection,
  CollectionId,
  CollectionType,
} from "metabase-types/api";

import { SidebarHeading, SidebarSection } from "../Sidebar";
import { SidebarCollectionLink, SidebarLink } from "../SidebarItems";
import type { SelectedItem } from "../types";

const BROWSE_DATABASES_URL = "/browse/databases";
const BROWSE_MODELS_URL = "/browse/models";
const BROWSE_METRICS_URL = "/browse/metrics";

/** The "Databases" browse link, shared by the Official and non-git navs. */
export function DatabasesNavLink({
  nonEntityItem,
  onItemSelect,
}: {
  nonEntityItem?: SelectedItem;
  onItemSelect: () => void;
}) {
  return (
    <SidebarLink
      icon="database"
      url={BROWSE_DATABASES_URL}
      isSelected={nonEntityItem?.url?.startsWith(BROWSE_DATABASES_URL)}
      onClick={onItemSelect}
      aria-label={t`Browse databases`}
    >
      {t`Databases`}
    </SidebarLink>
  );
}

/**
 * PROTOTYPE: the "Models" browse link, listed under Data in every nav variant
 * now that Models isn't in Data Studio.
 */
export function ModelsNavLink({
  nonEntityItem,
  onItemSelect,
}: {
  nonEntityItem?: SelectedItem;
  onItemSelect: () => void;
}) {
  return (
    <SidebarLink
      icon="model"
      url={BROWSE_MODELS_URL}
      isSelected={nonEntityItem?.url?.startsWith(BROWSE_MODELS_URL)}
      onClick={onItemSelect}
    >
      {t`Models`}
    </SidebarLink>
  );
}

/**
 * PROTOTYPE: the "Metrics" link to Browse metrics, which stands in for the
 * Library's Metrics section until that section holds a metric — always, on
 * instances without a Library (e.g. OSS). Browse metrics has the button for
 * creating one.
 */
export function MetricsNavLink({
  nonEntityItem,
  onItemSelect,
}: {
  nonEntityItem?: SelectedItem;
  onItemSelect: () => void;
}) {
  return (
    <SidebarLink
      icon="metric"
      url={BROWSE_METRICS_URL}
      isSelected={nonEntityItem?.url?.startsWith(BROWSE_METRICS_URL)}
      onClick={onItemSelect}
    >
      {t`Metrics`}
    </SidebarLink>
  );
}

/**
 * PROTOTYPE: whether the Library's Metrics section, or any folder in it, holds
 * at least one metric. False when there's no Library.
 */
export function libraryHasMetrics(collections: Collection[]): boolean {
  return collections.some(
    (collection) =>
      (collection.type === "library-metrics" &&
        [...(collection.here ?? []), ...(collection.below ?? [])].includes(
          "metric",
        )) ||
      libraryHasMetrics(collection.children ?? []),
  );
}

// Top-most collections synced from the git repository (with their subtrees).
// The Library syncs too, but it's listed under "Data" instead.
function getSyncedRoots(items: CollectionTreeItem[]): CollectionTreeItem[] {
  return items.flatMap((item) => {
    if (isLibraryCollection(item)) {
      return [];
    }
    return item.is_remote_synced ? [item] : getSyncedRoots(item.children);
  });
}

// Subfolders of the Library's sections share their section's type, so the
// section itself is the one marked as the Library root.
function findLibrarySection(
  items: CollectionTreeItem[],
  type: CollectionType,
): CollectionTreeItem | undefined {
  for (const item of items) {
    if (item.type === type && item.is_library_root) {
      return item;
    }
    const found = findLibrarySection(item.children, type);
    if (found != null) {
      return found;
    }
  }
  return undefined;
}

type Props = {
  collections: CollectionTreeItem[];
  selectedCollectionId?: CollectionId;
  nonEntityItem?: SelectedItem;
  hasDataAccess: boolean;
  onItemSelect: () => void;
};

/**
 * Content synced from the git repository: synced collections and data apps,
 * or an empty state pointing admins at the sync settings.
 */
export function SyncedContentList({
  collections,
  selectedCollectionId,
  onItemSelect,
}: Pick<Props, "collections" | "selectedCollectionId" | "onItemSelect">) {
  // Data apps and Data Studio pages hide this nav, so those links never need a
  // selected state.
  const isAdmin = useSelector(getUserIsAdmin);
  const syncedRoots = useMemo(() => getSyncedRoots(collections), [collections]);
  const { data: allDataApps = [] } = PLUGIN_DATA_APPS.useDataApps({
    skip: false,
  });
  const dataApps = allDataApps.filter((app) => app.enabled && !app.outdated);

  if (syncedRoots.length === 0 && dataApps.length === 0) {
    return (
      <Stack gap="sm" align="flex-start" ps="lg" pt="sm">
        <Text c="text-secondary" fz="sm">
          {t`Nothing from your repository is synced to this instance yet.`}
        </Text>
        {isAdmin && (
          <Button
            component={ForwardRefLink}
            to="/admin/settings/remote-sync"
            size="sm"
          >
            {t`Choose what to sync`}
          </Button>
        )}
      </Stack>
    );
  }

  return (
    <>
      <Tree
        data={syncedRoots}
        selectedId={selectedCollectionId}
        onSelect={onItemSelect}
        TreeNode={SidebarCollectionLink}
        role="tree"
        aria-label={t`Synced collections`}
        rightSection={(item) =>
          typeof item.id === "number" && (
            <PLUGIN_REMOTE_SYNC.ChangesBadge
              target={{ type: "collection", id: item.id }}
            />
          )
        }
      />
      {dataApps.map((app) => (
        <SidebarLink
          key={app.slug}
          icon="app"
          url={Urls.dataApp(app.slug)}
          onClick={onItemSelect}
        >
          {app.name}
        </SidebarLink>
      ))}
    </>
  );
}

/** The Library's published metrics and tables, plus the Databases browser. */
export function OfficialDataLinks({
  collections,
  selectedCollectionId,
  nonEntityItem,
  hasDataAccess,
  onItemSelect,
}: Props) {
  // The Library's Metrics and Data collections, labeled by what they hold.
  // As tree rows, they expand to list their subfolders when they have any.
  // Until the Library holds a metric, Metrics links to Browse metrics instead.
  const hasLibraryMetrics = libraryHasMetrics(collections);
  const metricsCollection = hasLibraryMetrics
    ? findLibrarySection(collections, "library-metrics")
    : undefined;
  const tablesCollection = findLibrarySection(collections, "library-data");
  const sectionTree = useMemo(
    () =>
      [
        metricsCollection && { ...metricsCollection, name: t`Metrics` },
        tablesCollection && { ...tablesCollection, name: t`Datasets` },
      ].filter((item): item is CollectionTreeItem => item != null),
    [metricsCollection, tablesCollection],
  );

  return (
    <>
      {!hasLibraryMetrics && (
        <MetricsNavLink
          nonEntityItem={nonEntityItem}
          onItemSelect={onItemSelect}
        />
      )}
      <Tree
        data={sectionTree}
        selectedId={selectedCollectionId}
        onSelect={onItemSelect}
        TreeNode={SidebarCollectionLink}
        role="tree"
        aria-label={t`Metrics and tables`}
        rightSection={(item) =>
          typeof item.id === "number" && (
            <PLUGIN_REMOTE_SYNC.ChangesBadge
              target={{ type: "collection", id: item.id }}
            />
          )
        }
      />
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
  );
}

/**
 * The "Official" side of the nav: content synced from the git repository
 * (collections and data apps) and the Library's published tables and metrics.
 */
export function OfficialNavSection(props: Props) {
  return (
    <>
      <SidebarSection>
        <ErrorBoundary>
          <SyncedContentList {...props} />
        </ErrorBoundary>
      </SidebarSection>

      <SidebarSection>
        <SidebarHeading>
          {c("A noun, shown in the sidebar as a navigation link").t`Data`}
        </SidebarHeading>
        <OfficialDataLinks {...props} />
      </SidebarSection>
    </>
  );
}
