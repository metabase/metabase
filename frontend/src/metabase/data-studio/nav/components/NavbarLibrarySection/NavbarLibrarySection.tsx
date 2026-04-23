import { useCallback, useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { isLibraryCollection } from "metabase/collections/utils";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import { Tree } from "metabase/common/components/tree";
import { useUserSetting } from "metabase/common/hooks";
import type { CollectionTreeItem } from "metabase/entities/collections";
import {
  buildCollectionTree,
  getCollectionIcon,
} from "metabase/entities/collections";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import type { Collection, CollectionType } from "metabase-types/api";

type LibraryCollectionSectionProps = {
  collections: Collection[];
  selectedId?: string | number;
  onItemSelect: () => void;
};

/** Build the tree for a single library section (Data or Metrics).
 *  If the user has access to the root collection, use it directly.
 *  If not, create a synthetic container for any promoted children. */
function buildSectionTree(
  libraryCollection: Collection,
  allCollections: Collection[],
  sectionType: CollectionType,
  sectionName: string,
): CollectionTreeItem | null {
  // Look for the real root collection (has is_library_root)
  const rootCollection = libraryCollection.children?.find(
    (c) => c.type === sectionType && c.is_library_root,
  );

  if (rootCollection) {
    // User has access to the root — build its subtree normally
    const [tree] = buildCollectionTree([rootCollection]);
    return tree ?? null;
  }

  // User doesn't have access to the root collection. Find any promoted
  // children of that type that were pulled up into the library collection.
  const promotedChildren = allCollections.filter(
    (c) => c.type === sectionType && !c.is_library_root,
  );

  // Also check direct children of the library collection that match the type
  const libraryChildren = (libraryCollection.children ?? []).filter(
    (c) => c.type === sectionType && !c.is_library_root,
  );

  const allOrphans = [...libraryChildren, ...promotedChildren];
  if (allOrphans.length === 0) {
    return null;
  }

  // Build subtrees for the orphaned children
  const children = buildCollectionTree(allOrphans);

  // Create a synthetic container node
  return {
    id: `synthetic-${sectionType}`,
    name: sectionName,
    description: null,
    icon: getCollectionIcon({
      type: sectionType,
      is_library_root: true,
    } as Collection),
    children,
    nonNavigable: true,
    type: sectionType,
    namespace: null,
    location: null,
    can_write: false,
    can_restore: false,
    can_delete: false,
  } as CollectionTreeItem;
}

export function NavbarLibrarySection({
  collections,
  selectedId,
  onItemSelect,
}: LibraryCollectionSectionProps) {
  const [expandLibrary = true, setExpandLibrary] = useUserSetting(
    "expand-library-in-nav",
  );

  const { isVisible: isGitSyncVisible } =
    PLUGIN_REMOTE_SYNC.useGitSyncVisible();
  const { isCollectionDirty } = PLUGIN_REMOTE_SYNC.useRemoteSyncDirtyState();

  const libraryTree = useMemo(() => {
    const libraryCollection = collections.find(isLibraryCollection);
    if (!libraryCollection) {
      return [];
    }

    const dataTree = buildSectionTree(
      libraryCollection,
      collections,
      "library-data",
      t`Data`,
    );
    const metricsTree = buildSectionTree(
      libraryCollection,
      collections,
      "library-metrics",
      t`Metrics`,
    );

    return [dataTree, metricsTree].filter(
      (node): node is CollectionTreeItem => node != null,
    );
  }, [collections]);

  const showChangesBadge = useCallback(
    (itemId?: number | string) => {
      if (!isGitSyncVisible || typeof itemId !== "number") {
        return false;
      }
      return isCollectionDirty(itemId);
    },
    [isGitSyncVisible, isCollectionDirty],
  );

  if (libraryTree.length === 0) {
    return null;
  }

  return (
    <SidebarSection>
      <ErrorBoundary>
        <CollapseSection
          header={<SidebarHeading>{t`Library`}</SidebarHeading>}
          initialState={expandLibrary ? "expanded" : "collapsed"}
          iconPosition="right"
          iconSize={8}
          role="section"
          aria-label={t`Library`}
          onToggle={setExpandLibrary}
        >
          <Tree
            data={libraryTree}
            selectedId={selectedId}
            onSelect={onItemSelect}
            TreeNode={SidebarCollectionLink}
            role="tree"
            aria-label="library-collection-tree"
            rightSection={(item) =>
              isGitSyncVisible &&
              showChangesBadge(item?.id) &&
              PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge && (
                <PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge />
              )
            }
          />
        </CollapseSection>
      </ErrorBoundary>
    </SidebarSection>
  );
}
