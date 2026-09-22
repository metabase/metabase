import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { buildCollectionTree } from "metabase/common/collections/utils";
import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { Tree } from "metabase/common/components/tree";
import { getUserIsAdmin } from "metabase/current-user";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import type { WorktreeNavProps } from "metabase/plugins/types";
import { useSelector } from "metabase/redux";
import { useListWorktreesQuery } from "metabase-enterprise/api";
import type { Worktree } from "metabase-types/api";

type WorktreeBranchProps = {
  worktree: Worktree;
  onItemSelect: () => void;
};

function WorktreeBranch({ worktree, onItemSelect }: WorktreeBranchProps) {
  const { data: collections = [] } = useListCollectionsTreeQuery({
    "exclude-archived": true,
    "worktree-id": worktree.id,
  });

  const branch = {
    id: `worktree-${worktree.id}`,
    name: worktree.branch,
    icon: "git_branch" as const,
    children: buildCollectionTree(collections),
  };

  return (
    <Tree
      data={[branch]}
      onSelect={onItemSelect}
      role="tree"
      aria-label={worktree.branch}
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
