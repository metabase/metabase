import { useMemo } from "react";
import { t } from "ttag";

import type { CollectionTreeItem } from "metabase/common/collections/utils";
import {
  buildCollectionTree,
  getCollectionIcon,
  isLibraryCollection,
} from "metabase/common/collections/utils";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { Tree } from "metabase/common/components/tree";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/Sidebar";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useUserSetting } from "metabase/settings";
import type {
  Collection,
  CollectionContentModel,
  CollectionType,
} from "metabase-types/api";

type LibraryCollectionSectionProps = {
  collections: Collection[];
  selectedId?: string | number;
  onItemSelect: () => void;
};

function hasModel(
  collection: Collection,
  model: CollectionContentModel,
): boolean {
  return Boolean(
    collection.here?.includes(model) || collection.below?.includes(model),
  );
}

/** Build the tree for a single library section (Data, Metrics, or Dashboards).
 *  If the user has access to the root collection, use it directly.
 *  If not, create a synthetic container for any promoted children.
 *  A section with a `contentModel` is left out when it holds no item of that model. */
function buildSectionTree(
  libraryCollection: Collection,
  allCollections: Collection[],
  sectionType: CollectionType,
  sectionName: string,
  contentModel?: CollectionContentModel,
): CollectionTreeItem | null {
  // Look for the real root collection (has is_library_root)
  const rootCollection = libraryCollection.children?.find(
    (c) => c.type === sectionType && c.is_library_root,
  );

  if (rootCollection) {
    if (contentModel && !hasModel(rootCollection, contentModel)) {
      return null;
    }
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
  if (
    allOrphans.length === 0 ||
    (contentModel &&
      !allOrphans.some((orphan) => hasModel(orphan, contentModel)))
  ) {
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
    }),
    children,
    nonNavigable: true,
    type: sectionType,
    is_library_root: true,
    namespace: null,
    location: null,
    can_write: false,
    can_restore: false,
    can_delete: false,
  };
}

export function NavbarLibrarySection({
  collections,
  selectedId,
  onItemSelect,
}: LibraryCollectionSectionProps) {
  const [expandLibrary = true, setExpandLibrary] = useUserSetting(
    "expand-library-in-nav",
  );

  const libraryCollection = useMemo(
    () => collections.find(isLibraryCollection),
    [collections],
  );

  const libraryTree = useMemo(() => {
    if (
      !libraryCollection ||
      !(
        libraryCollection.below?.includes("table") ||
        libraryCollection.below?.includes("metric")
      )
    ) {
      return [];
    }

    const dataTree = buildSectionTree(
      libraryCollection,
      collections,
      "library-data",
      t`Data`,
      "table",
    );
    const metricsTree = buildSectionTree(
      libraryCollection,
      collections,
      "library-metrics",
      t`Metrics`,
      "metric",
    );
    const dashboardsTree = buildSectionTree(
      libraryCollection,
      collections,
      "library-dashboards",
      t`Dashboards`,
    );

    return [dataTree, metricsTree, dashboardsTree].filter(
      (node): node is CollectionTreeItem => node != null,
    );
  }, [collections, libraryCollection]);

  if (!libraryCollection || libraryTree.length === 0) {
    return null;
  }

  return (
    <SidebarSection>
      <ErrorBoundary>
        <CollapseSection
          header={<SidebarHeading>{libraryCollection.name}</SidebarHeading>}
          initialState={expandLibrary ? "expanded" : "collapsed"}
          iconPosition="right"
          iconSize={8}
          role="section"
          aria-label={libraryCollection.name}
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
              typeof item.id === "number" && (
                <PLUGIN_REMOTE_SYNC.ChangesBadge
                  target={{ type: "collection", id: item.id }}
                />
              )
            }
          />
        </CollapseSection>
      </ErrorBoundary>
    </SidebarSection>
  );
}
