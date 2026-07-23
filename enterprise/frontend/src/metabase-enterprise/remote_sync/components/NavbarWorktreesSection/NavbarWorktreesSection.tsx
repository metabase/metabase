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
import { ActionIcon, Combobox, Group, Icon, useCombobox } from "metabase/ui";
import {
  useCreateWorktreeMutation,
  useDeleteWorktreeMutation,
  useGetHasRemoteChangesQuery,
  useGetRemoteSyncHasChangesQuery,
  useListWorktreesQuery,
  usePullWorktreeMutation,
  usePushWorktreeMutation,
} from "metabase-enterprise/api";
import type {
  RemoteSyncWorktree,
  RemoteSyncWorktreeId,
} from "metabase-types/api";

import { useGitSyncVisible } from "../../hooks/use-git-sync-visible";
import { GitSyncOptionsDropdown } from "../GitSyncControls/GitSyncOptionsDropdown";

import { CreateWorktreeModal } from "./CreateWorktreeModal";

const WORKTREE_NODE_PREFIX = "worktree-";

function worktreeTreeNode(worktree: RemoteSyncWorktree): ITreeNodeItem {
  return {
    id: `${WORKTREE_NODE_PREFIX}${worktree.id}`,
    name: worktree.branch,
    icon: "git_branch",
    nonNavigable: true,
    children: worktree.roots.map((root) => ({
      id: root.id,
      name: root.name,
      icon: "folder",
    })),
  };
}

function worktreeIdOfNode(item: ITreeNodeItem): RemoteSyncWorktreeId | null {
  if (typeof item.id === "string" && item.id.startsWith(WORKTREE_NODE_PREFIX)) {
    return Number(item.id.slice(WORKTREE_NODE_PREFIX.length));
  }
  return null;
}

interface WorktreeMenuProps {
  worktreeId: RemoteSyncWorktreeId;
  onPull: (worktreeId: RemoteSyncWorktreeId) => void;
  onPush: (worktreeId: RemoteSyncWorktreeId) => void;
  onDelete: (worktreeId: RemoteSyncWorktreeId) => void;
}

function WorktreeMenu({
  worktreeId,
  onPull,
  onPush,
  onDelete,
}: WorktreeMenuProps) {
  const combobox = useCombobox();

  const { currentData: dirtyData, isFetching: isFetchingDirty } =
    useGetRemoteSyncHasChangesQuery(
      { "worktree-id": worktreeId },
      {
        refetchOnMountOrArgChange: 10,
        skip: !combobox.dropdownOpened,
      },
    );
  const {
    currentData: remoteChangesData,
    isFetching: isFetchingRemoteChanges,
    isError: hasRemoteChangesError,
  } = useGetHasRemoteChangesQuery(
    { "worktree-id": worktreeId },
    {
      refetchOnMountOrArgChange: 10,
      skip: !combobox.dropdownOpened,
    },
  );

  return (
    <Combobox position="bottom-end" store={combobox} width={280} withinPortal>
      <Combobox.Target>
        <ActionIcon
          aria-label={t`Worktree actions`}
          size="sm"
          variant="subtle"
          onClick={(event) => {
            event.stopPropagation();
            combobox.toggleDropdown();
          }}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Combobox.Target>
      <GitSyncOptionsDropdown
        worktreeId={worktreeId}
        isPullDisabled={!remoteChangesData?.has_changes}
        isPullError={hasRemoteChangesError}
        isLoadingPull={isFetchingRemoteChanges}
        isPushDisabled={isFetchingDirty || !dirtyData?.is_dirty}
        onPullClick={() => {
          combobox.closeDropdown();
          onPull(worktreeId);
        }}
        onPushClick={() => {
          combobox.closeDropdown();
          onPush(worktreeId);
        }}
        onDeleteClick={() => {
          combobox.closeDropdown();
          onDelete(worktreeId);
        }}
      />
    </Combobox>
  );
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

  const treeData = useMemo(
    () => (worktreesData?.items ?? []).map(worktreeTreeNode),
    [worktreesData],
  );

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

  const handlePull = useCallback(
    (worktreeId: RemoteSyncWorktreeId) => {
      pullWorktree({ worktree_id: worktreeId })
        .unwrap()
        .catch((error) => notifyError(error, t`Failed to pull the worktree`));
    },
    [notifyError, pullWorktree],
  );

  const handlePush = useCallback(
    (worktreeId: RemoteSyncWorktreeId) => {
      pushWorktree({ worktree_id: worktreeId })
        .unwrap()
        .catch((error) => notifyError(error, t`Failed to push the worktree`));
    },
    [notifyError, pushWorktree],
  );

  const handleDelete = useCallback(
    (worktreeId: RemoteSyncWorktreeId) => {
      deleteWorktree({ id: worktreeId })
        .unwrap()
        .catch((error) => notifyError(error, t`Failed to delete the worktree`));
    },
    [deleteWorktree, notifyError],
  );

  const worktreeMenu = useCallback(
    (item?: ITreeNodeItem) => {
      const worktreeId = item ? worktreeIdOfNode(item) : null;
      if (worktreeId == null) {
        return null;
      }
      return (
        <WorktreeMenu
          worktreeId={worktreeId}
          onPull={handlePull}
          onPush={handlePush}
          onDelete={handleDelete}
        />
      );
    },
    [handleDelete, handlePull, handlePush],
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
