import { useMemo } from "react";
import { t } from "ttag";

import type { CollectionTreeItem } from "metabase/common/collections/utils";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import { Tree } from "metabase/common/components/tree";
import type { CollectionId } from "metabase-types/api";

import { SidebarHeading, SidebarSection } from "../MainNavbar.styled";

import { OfficialNavTreeNode } from "./OfficialNavTreeNode";
import { buildOfficialNavTree } from "./official-nav-tree";
import type { OfficialNavItem } from "./use-official-nav-items";

type NavbarOfficialSectionProps = {
  collections: CollectionTreeItem[];
  officialCollectionIds: CollectionId[];
  itemsByCollectionId: Map<CollectionId, OfficialNavItem[]>;
  selectedId?: string | number;
  onItemSelect: () => void;
};

export function NavbarOfficialSection({
  collections,
  officialCollectionIds,
  itemsByCollectionId,
  selectedId,
  onItemSelect,
}: NavbarOfficialSectionProps) {
  const tree = useMemo(() => {
    const officialIds = new Set(officialCollectionIds);
    const roots = collectOfficialRoots(collections, officialIds);
    return buildOfficialNavTree(roots, itemsByCollectionId);
  }, [collections, officialCollectionIds, itemsByCollectionId]);

  if (tree.length === 0) {
    return null;
  }

  return (
    <SidebarSection>
      <CollapseSection
        header={<SidebarHeading>{t`Official`}</SidebarHeading>}
        initialState="expanded"
        iconPosition="right"
        iconSize={8}
        role="section"
        aria-label={t`Official`}
      >
        <Tree
          data={tree}
          selectedId={selectedId}
          onSelect={onItemSelect}
          TreeNode={OfficialNavTreeNode}
          role="tree"
          aria-label="official-collection-tree"
        />
      </CollapseSection>
    </SidebarSection>
  );
}

function collectOfficialRoots(
  collections: CollectionTreeItem[],
  officialIds: Set<CollectionId>,
): CollectionTreeItem[] {
  return collections.flatMap((collection) =>
    officialIds.has(collection.id)
      ? [collection]
      : collectOfficialRoots(collection.children ?? [], officialIds),
  );
}
