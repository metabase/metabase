import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { useSelector } from "metabase/redux";
import { Group } from "metabase/ui";
import type { RemoteSyncWorktree } from "metabase-types/api";

import { getIsRemoteSyncReadOnly } from "../../selectors";
import { PushChangesModal } from "../PushChangesModal";
import { SyncConflictModal } from "../SyncConflictModal";
import { CollectionSyncStatusBadge } from "../SyncedCollectionsSidebarSection";

import { CreateWorktreeCollectionModal } from "./CreateWorktreeCollectionModal";
import { WorktreeMenu } from "./WorktreeMenu";
import { WorktreeTreeNode, isWorktreeRootData } from "./WorktreeTreeNode";
import { useWorktreeSyncActions } from "./use-worktree-sync-actions";
import { useWorktreeTreeItems } from "./use-worktree-tree-items";

interface WorktreeNavItemProps {
  worktree: RemoteSyncWorktree;
  selectedId?: number | string;
  onItemSelect: () => void;
}

export const WorktreeNavItem = ({
  worktree,
  selectedId,
  onItemSelect,
}: WorktreeNavItemProps) => {
  const isReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const treeData = useWorktreeTreeItems(worktree);
  const {
    isDirty,
    isPullDisabled,
    isFetchingRemoteChanges,
    isCheckingPreflight,
    isMenuOpen,
    setIsMenuOpen,
    conflict,
    closeConflict,
    isPushModalOpen,
    closePushModal,
    handlePull,
    handlePush,
    handleDelete,
  } = useWorktreeSyncActions(worktree);

  const [
    isDeleteModalOpen,
    { open: openDeleteModal, close: closeDeleteModal },
  ] = useDisclosure(false);
  const [
    isNewCollectionModalOpen,
    { open: openNewCollectionModal, close: closeNewCollectionModal },
  ] = useDisclosure(false);

  const handleConfirmDelete = useCallback(async () => {
    if (await handleDelete()) {
      closeDeleteModal();
    }
  }, [closeDeleteModal, handleDelete]);

  const renderRightSection = useCallback(
    (item: ITreeNodeItem) => {
      if (!isWorktreeRootData(item.data)) {
        return null;
      }
      return (
        <Group
          ml="auto"
          gap={0}
          wrap="nowrap"
          onClick={(event) => event.stopPropagation()}
        >
          {isDirty && <CollectionSyncStatusBadge />}
          <WorktreeMenu
            isReadOnly={isReadOnly}
            isDirty={isDirty}
            isPullDisabled={isPullDisabled}
            isFetchingRemoteChanges={isFetchingRemoteChanges}
            isCheckingPreflight={isCheckingPreflight}
            isOpen={isMenuOpen}
            onOpenChange={setIsMenuOpen}
            onPull={handlePull}
            onPush={handlePush}
            onNewCollection={openNewCollectionModal}
            onDelete={openDeleteModal}
          />
        </Group>
      );
    },
    [
      handlePull,
      handlePush,
      isCheckingPreflight,
      isDirty,
      isFetchingRemoteChanges,
      isMenuOpen,
      isPullDisabled,
      isReadOnly,
      openDeleteModal,
      openNewCollectionModal,
      setIsMenuOpen,
    ],
  );

  return (
    <>
      <Tree
        data={treeData}
        selectedId={selectedId}
        onSelect={onItemSelect}
        TreeNode={WorktreeTreeNode}
        role="tree"
        aria-label="worktree-collection-tree"
        rightSection={renderRightSection}
      />

      {isNewCollectionModalOpen && (
        <CreateWorktreeCollectionModal
          worktree={worktree}
          onClose={closeNewCollectionModal}
        />
      )}

      {isPushModalOpen && (
        <PushChangesModal
          currentBranch={worktree.branch}
          worktreeId={worktree.id}
          onClose={closePushModal}
        />
      )}

      {conflict && (
        <SyncConflictModal
          currentBranch={worktree.branch}
          worktreeId={worktree.id}
          variant={conflict.variant}
          canMerge={conflict.preflight?.clean}
          conflicts={conflict.preflight?.conflicts}
          forcePushCasualties={conflict.preflight?.force_push_casualties}
          historyRewritten={conflict.preflight?.reason === "history-rewritten"}
          onClose={closeConflict}
        />
      )}

      <ConfirmModal
        opened={isDeleteModalOpen}
        title={t`Delete the "${worktree.branch}" worktree?`}
        message={t`Everything checked out into this worktree will be deleted from this instance. The "${worktree.branch}" branch itself won't be touched.`}
        confirmButtonText={t`Delete worktree`}
        onConfirm={handleConfirmDelete}
        onClose={closeDeleteModal}
      />
    </>
  );
};
