import { useMemo } from "react";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import type { CollectionTreeItem } from "metabase/common/collections/utils";
import {
  buildCollectionTree,
  isLibraryCollection,
  nonPersonalOrArchivedCollection,
} from "metabase/common/collections/utils";
import { ForwardRefLink } from "metabase/common/components/Link";
import { Tree } from "metabase/common/components/tree";
import { getIsTenantUser, getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_DATA_APPS, PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { Location } from "metabase/router";
import { useSetting } from "metabase/settings";
import { Button, Loader, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CollectionId } from "metabase-types/api";

import { isCollectionPath } from "../../MainNavbar/getSelectedItems";
import {
  SidebarCollectionLink,
  SidebarLink,
} from "../../MainNavbar/SidebarItems";
import { SubNavHeading, SubNavSection } from "../SubNav";

import { SemanticLayerSection } from "./SemanticLayerSection";

const REMOTE_SYNC_SETTINGS_URL = "/admin/settings/remote-sync";

// Same args as the main collections nav so both share one cached request.
const COLLECTIONS_TREE_REQUEST = {
  "exclude-other-user-collections": true,
  "exclude-archived": true,
  "include-library": true,
} as const;

// Keeps the top-most synced collections (with their whole subtree). Synced
// collections nested under unsynced parents are lifted to the top level.
function getSyncedRoots(items: CollectionTreeItem[]): CollectionTreeItem[] {
  return items.flatMap((item) =>
    item.is_remote_synced ? [item] : getSyncedRoots(item.children),
  );
}

function collectIds(items: CollectionTreeItem[], ids: Set<CollectionId>) {
  items.forEach((item) => {
    ids.add(item.id);
    collectIds(item.children, ids);
  });
  return ids;
}

/** Collections that are synced with the Git repository set up in remote sync. */
export function useSyncedCollections() {
  const isRemoteSyncEnabled = Boolean(useSetting("remote-sync-enabled"));
  const isTenantUser = useSelector(getIsTenantUser);
  const { data: collections = [], isLoading } = useListCollectionsTreeQuery(
    COLLECTIONS_TREE_REQUEST,
    { skip: !isRemoteSyncEnabled },
  );

  return useMemo(() => {
    const tree = buildCollectionTree(
      collections.filter(nonPersonalOrArchivedCollection),
      { isTenantUser },
    );
    // The Library is synced too, but it has its own rail tab.
    const syncedTree = isRemoteSyncEnabled
      ? getSyncedRoots(tree).filter((item) => !isLibraryCollection(item))
      : [];
    return {
      isRemoteSyncEnabled,
      isLoading,
      syncedTree,
      syncedIds: collectIds(syncedTree, new Set()),
    };
  }, [collections, isLoading, isRemoteSyncEnabled, isTenantUser]);
}

type Props = {
  location: Location;
  params: { slug?: string };
  // Keeps Home selected after clicking into synced content.
  onPin: () => void;
};

// Official content (git-synced collections and data apps), then the semantic
// layer.
export function HomeSection(props: Props) {
  return (
    <>
      <OfficialContentSection {...props} />
      <SemanticLayerSection location={props.location} />
    </>
  );
}

function OfficialContentSection({ location, params, onPin }: Props) {
  const isAdmin = useSelector(getUserIsAdmin);
  const { isRemoteSyncEnabled, isLoading, syncedTree } = useSyncedCollections();
  // Data apps are served from the synced repository, so they're official
  // content too. They live outside the collection tree, so they're listed as
  // top-level siblings of the synced collections.
  const { data: allDataApps = [], isLoading: isLoadingDataApps } =
    PLUGIN_DATA_APPS.useDataApps({ skip: !isRemoteSyncEnabled });
  const dataApps = allDataApps.filter((app) => app.enabled && !app.outdated);

  const selectedId = isCollectionPath(location.pathname)
    ? (Urls.extractEntityId(params.slug) ?? undefined)
    : undefined;

  if (isLoading || isLoadingDataApps) {
    return (
      <SubNavSection>
        <Loader size="sm" />
      </SubNavSection>
    );
  }

  if (
    !isRemoteSyncEnabled ||
    (syncedTree.length === 0 && dataApps.length === 0)
  ) {
    return (
      <SubNavSection>
        <Stack gap="sm" align="flex-start">
          <Text c="text-secondary" fz="sm">
            {isRemoteSyncEnabled
              ? t`Nothing from your repository is synced to this instance yet.`
              : t`Connect a Git repository to see its content here.`}
          </Text>
          {isAdmin && (
            <Button
              component={ForwardRefLink}
              to={REMOTE_SYNC_SETTINGS_URL}
              size="sm"
            >
              {isRemoteSyncEnabled
                ? t`Choose what to sync`
                : t`Set up remote sync`}
            </Button>
          )}
        </Stack>
      </SubNavSection>
    );
  }

  return (
    <SubNavSection>
      <SubNavHeading>{t`Official content`}</SubNavHeading>
      <Tree
        data={syncedTree}
        selectedId={selectedId}
        onSelect={onPin}
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
            // Skip the tree's chevron column (6px + 12px chevron + 6px)
            // so the app icon lines up with top-level folder icons.
            pl={24}
            url={url}
            isSelected={location.pathname.startsWith(url)}
            onClick={onPin}
          >
            {app.name}
          </SidebarLink>
        );
      })}
    </SubNavSection>
  );
}
