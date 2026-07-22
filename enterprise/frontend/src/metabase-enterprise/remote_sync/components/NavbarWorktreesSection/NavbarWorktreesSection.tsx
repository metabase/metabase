import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { getErrorMessage } from "metabase/api/utils";
import { CollapseSection } from "metabase/common/components/CollapseSection";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useSetting, useToast, useUserSetting } from "metabase/common/hooks";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import type { NavbarWorktreesSectionProps } from "metabase/plugins/oss/remote-sync";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { ActionIcon, Group, Icon, Menu } from "metabase/ui";
import {
  useCreateWorktreeMutation,
  useDeleteWorktreeMutation,
  useListWorktreesQuery,
  usePullWorktreeMutation,
  usePushWorktreeMutation,
} from "metabase-enterprise/api";
import type { RemoteSyncWorktree } from "metabase-types/api";

import { useGitSyncVisible } from "../../hooks/use-git-sync-visible";

import { CreateWorktreeModal } from "./CreateWorktreeModal";

const WORKTREE_NODE_PREFIX = "worktree-";

function worktreeTreeNode(worktree: RemoteSyncWorktree): ITreeNodeItem {
  const pulled = worktree.base_version != null;
  return {
    id: `${WORKTREE_NODE_PREFIX}${worktree.id}`,
    name: pulled ? worktree.branch : t`${worktree.branch} (not pulled yet)`,
    icon: "git_branch",
    nonNavigable: true,
    children: worktree.roots.map((root) => ({
      id: root.id,
      name: root.name,
      icon: "folder",
    })),
  };
}

function worktreeIdOfNode(
  item: ITreeNodeItem,
): RemoteSyncWorktree["id"] | null {
  if (typeof item.id === "string" && item.id.startsWith(WORKTREE_NODE_PREFIX)) {
    return Number(item.id.slice(WORKTREE_NODE_PREFIX.length));
  }
  return null;
}

export function NavbarWorktreesSection({
  selectedId,
  onItemSelect,
}: NavbarWorktreesSectionProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const worktreesEnabled = useSetting("remote-sync-worktrees");
  const { isVisible: isGitSyncVisible } = useGitSyncVisible();
  const isEnabled = Boolean(isAdmin && worktreesEnabled && isGitSyncVisible);

  const [isExpanded = true, setIsExpanded] = useUserSetting(
    "expand-worktrees-in-nav",
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [sendToast] = useToast();

  const { data: worktreesData } = useListWorktreesQuery(undefined, {
    skip: !isEnabled,
  });
  const [createWorktree, { isLoading: isCreating }] =
    useCreateWorktreeMutation();
  const [deleteWorktree] = useDeleteWorktreeMutation();
  const [pullWorktree] = usePullWorktreeMutation();
  const [pushWorktree] = usePushWorktreeMutation();

  const worktrees = useMemo(
    () =>
      (worktreesData?.items ?? []).filter((worktree) => !worktree.is_default),
    [worktreesData],
  );
  const treeData = useMemo(() => worktrees.map(worktreeTreeNode), [worktrees]);

  const notifyError = useCallback(
    (error: unknown, fallback: string) => {
      sendToast({ message: getErrorMessage(error, fallback), icon: "warning" });
    },
    [sendToast],
  );

  const handleCreate = useCallback(
    async (branch: string) => {
      try {
        const worktree = await createWorktree({ branch }).unwrap();
        setIsCreateModalOpen(false);
        await pullWorktree({ worktree_id: worktree.id }).unwrap();
      } catch (error) {
        notifyError(error, t`Failed to check out the branch`);
      }
    },
    [createWorktree, notifyError, pullWorktree],
  );

  const worktreeMenu = useCallback(
    (item?: ITreeNodeItem) => {
      const worktreeId = item ? worktreeIdOfNode(item) : null;
      if (worktreeId == null) {
        return null;
      }
      return (
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon
              aria-label={t`Worktree actions`}
              size="sm"
              variant="subtle"
              onClick={(event) => event.stopPropagation()}
            >
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name="download" />}
              onClick={() =>
                pullWorktree({ worktree_id: worktreeId })
                  .unwrap()
                  .catch((error) =>
                    notifyError(error, t`Failed to pull the worktree`),
                  )
              }
            >
              {t`Pull`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="upload" />}
              onClick={() =>
                pushWorktree({ worktree_id: worktreeId })
                  .unwrap()
                  .catch((error) =>
                    notifyError(error, t`Failed to push the worktree`),
                  )
              }
            >
              {t`Push`}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              c="danger"
              leftSection={<Icon name="trash" />}
              onClick={() =>
                deleteWorktree({ id: worktreeId })
                  .unwrap()
                  .catch((error) =>
                    notifyError(error, t`Failed to delete the worktree`),
                  )
              }
            >
              {t`Delete worktree`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      );
    },
    [deleteWorktree, notifyError, pullWorktree, pushWorktree],
  );

  if (!isEnabled || (treeData.length === 0 && !isAdmin)) {
    return null;
  }

  return (
    <SidebarSection>
      <ErrorBoundary>
        <CollapseSection
          header={
            <Group gap="xs" justify="space-between" w="100%">
              <SidebarHeading>{t`Worktrees`}</SidebarHeading>
              <ActionIcon
                aria-label={t`Check out a branch`}
                size="sm"
                variant="subtle"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsCreateModalOpen(true);
                }}
              >
                <Icon name="add" />
              </ActionIcon>
            </Group>
          }
          initialState={isExpanded ? "expanded" : "collapsed"}
          iconPosition="right"
          iconSize={8}
          role="section"
          aria-label={t`Worktrees`}
          onToggle={setIsExpanded}
        >
          <Tree
            data={treeData}
            selectedId={selectedId}
            onSelect={onItemSelect}
            TreeNode={SidebarCollectionLink}
            role="tree"
            aria-label="worktrees-tree"
            rightSection={worktreeMenu}
          />
        </CollapseSection>
        <CreateWorktreeModal
          opened={isCreateModalOpen}
          isCreating={isCreating}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreate}
        />
      </ErrorBoundary>
    </SidebarSection>
  );
}
