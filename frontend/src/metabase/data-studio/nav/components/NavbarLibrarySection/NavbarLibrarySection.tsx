import { useCallback, useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { isLibraryCollection } from "metabase/collections/utils";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import { Tree } from "metabase/common/components/tree";
import { useUserSetting } from "metabase/common/hooks";
import { buildCollectionTree } from "metabase/entities/collections";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import type { Collection } from "metabase-types/api";

type LibraryCollectionSectionProps = {
  collections: Collection[];
  selectedId?: string | number;
  onItemSelect: () => void;
};

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
    const tree = buildCollectionTree([libraryCollection], {
      modelFilter: () => true,
    });
    if (tree.length === 0) {
      return [];
    }
    return tree[0].children || [];
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
