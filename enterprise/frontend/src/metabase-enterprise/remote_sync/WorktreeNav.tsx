import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { buildCollectionTree } from "metabase/common/collections/utils";
import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { getUserIsAdmin } from "metabase/current-user";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import type { WorktreeNavProps } from "metabase/plugins/types";
import { useSelector } from "metabase/redux";
import { Group } from "metabase/ui";
import {
  useGetRemoteSyncChangesQuery,
  useListWorktreesQuery,
} from "metabase-enterprise/api";
import type { Worktree } from "metabase-types/api";

import { WorktreeMenu } from "./WorktreeMenu";
import { CollectionSyncStatusBadge } from "./components/SyncedCollectionsSidebarSection/CollectionSyncStatusBadge";

type WorktreeBranchProps = {
  worktree: Worktree;
  onItemSelect: () => void;
};

function WorktreeBranch({ worktree, onItemSelect }: WorktreeBranchProps) {
  const { data: collections = [] } = useListCollectionsTreeQuery({
    "exclude-archived": true,
    "worktree-id": worktree.id,
  });
  const { data: changes } = useGetRemoteSyncChangesQuery({
    "worktree-id": worktree.id,
  });

  const branch = {
    id: `worktree-${worktree.id}`,
    name: worktree.branch,
    icon: { name: "git_branch" as const },
    nonNavigable: true,
    children: buildCollectionTree(collections),
  };

  const hasChanges = changes != null && changes.dirty.length > 0;

  const renderRightSection = (item: ITreeNodeItem) => {
    if (item.id === branch.id) {
      return (
        <Group gap="xs" wrap="nowrap">
          {hasChanges && <CollectionSyncStatusBadge />}
          <WorktreeMenu worktree={worktree} hasChanges={hasChanges} />
        </Group>
      );
    }
    const isDirty =
      changes != null && changes.changedCollections[Number(item.id)];
    return isDirty ? <CollectionSyncStatusBadge /> : undefined;
  };

  return (
    <Tree
      data={[branch]}
      onSelect={onItemSelect}
      TreeNode={SidebarCollectionLink}
      role="tree"
      aria-label={worktree.branch}
      rightSection={renderRightSection}
    />
  );
}

export function WorktreeNav({ onItemSelect }: WorktreeNavProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const { data: worktrees = [] } = useListWorktreesQuery(undefined, {
    skip: !isAdmin,
  });

  if (worktrees.length === 0) {
    return null;
  }

  return (
    <SidebarSection>
      <ErrorBoundary>
        <SidebarHeading>{t`Branches`}</SidebarHeading>
        {worktrees.map((worktree) => (
          <WorktreeBranch
            key={worktree.id}
            worktree={worktree}
            onItemSelect={onItemSelect}
          />
        ))}
      </ErrorBoundary>
    </SidebarSection>
  );
}
