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
import type { CollectionId, CollectionType } from "metabase-types/api";

import { SidebarHeading, SidebarSection } from "../Sidebar";
import { SidebarCollectionLink, SidebarLink } from "../SidebarItems";
import type { SelectedItem } from "../types";

const BROWSE_DATABASES_URL = "/browse/databases";

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

function findCollection(
  items: CollectionTreeItem[],
  type: CollectionType,
): CollectionTreeItem | undefined {
  for (const item of items) {
    if (item.type === type) {
      return item;
    }
    const found = findCollection(item.children, type);
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
 * The "Official" side of the nav: content synced from the git repository
 * (collections and data apps) and the Library's published tables and metrics.
 */
export function OfficialNavSection({
  collections,
  selectedCollectionId,
  nonEntityItem,
  hasDataAccess,
  onItemSelect,
}: Props) {
  // Data apps and Data Studio pages hide this nav, so those links never need a
  // selected state.
  const isAdmin = useSelector(getUserIsAdmin);
  const syncedRoots = useMemo(() => getSyncedRoots(collections), [collections]);
  const { data: allDataApps = [] } = PLUGIN_DATA_APPS.useDataApps({
    skip: false,
  });
  const dataApps = allDataApps.filter((app) => app.enabled && !app.outdated);

  // The Library's Data and Metrics collection pages list every published
  // table and metric.
  const tablesCollection = findCollection(collections, "library-data");
  const metricsCollection = findCollection(collections, "library-metrics");

  return (
    <>
      <SidebarSection>
        <ErrorBoundary>
          {syncedRoots.length === 0 && dataApps.length === 0 ? (
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
          ) : (
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
              {dataApps.map((app) => {
                const url = Urls.dataApp(app.slug);
                return (
                  <SidebarLink
                    key={app.slug}
                    icon="app"
                    url={url}
                    onClick={onItemSelect}
                  >
                    {app.name}
                  </SidebarLink>
                );
              })}
            </>
          )}
        </ErrorBoundary>
      </SidebarSection>

      <SidebarSection>
        <SidebarHeading>
          {c("A noun, shown in the sidebar as a navigation link").t`Data`}
        </SidebarHeading>
        {metricsCollection && (
          <SidebarLink
            icon="metric"
            url={Urls.collection(metricsCollection)}
            isSelected={selectedCollectionId === metricsCollection.id}
            onClick={onItemSelect}
          >
            {t`Metrics`}
          </SidebarLink>
        )}
        {tablesCollection && (
          <SidebarLink
            icon="table"
            url={Urls.collection(tablesCollection)}
            isSelected={selectedCollectionId === tablesCollection.id}
            onClick={onItemSelect}
          >
            {t`Tables`}
          </SidebarLink>
        )}
        {hasDataAccess && (
          <DatabasesNavLink
            nonEntityItem={nonEntityItem}
            onItemSelect={onItemSelect}
          />
        )}
      </SidebarSection>
    </>
  );
}
