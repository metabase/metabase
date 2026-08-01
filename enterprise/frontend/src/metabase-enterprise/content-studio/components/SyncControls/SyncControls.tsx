import { useCallback } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import type { ContentStudioSyncControlsProps } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import {
  Button,
  FixedSizeIcon,
  Icon,
  Loader,
  Menu,
  Tooltip,
} from "metabase/ui";
import { CollectionSyncStatusBadge } from "metabase-enterprise/remote_sync/components/CollectionSyncStatusBadge";
import { PushChangesModal } from "metabase-enterprise/remote_sync/components/PushChangesModal";
import { SyncConflictModal } from "metabase-enterprise/remote_sync/components/SyncConflictModal";
import { SyncOutOfDateModal } from "metabase-enterprise/remote_sync/components/SyncOutOfDateModal";
import { useExportConflictToast } from "metabase-enterprise/remote_sync/hooks/use-export-conflict-toast";
import { useWorktrees } from "metabase-enterprise/remote_sync/hooks/use-worktrees";
import {
  getIsRemoteSyncReadOnly,
  getIsRunning,
  getSyncConflictVariant,
} from "metabase-enterprise/remote_sync/selectors";
import { syncConflictVariantUpdated } from "metabase-enterprise/remote_sync/sync-task-slice";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

import { useContentStudioScope } from "../../scope";
import { useSyncActions } from "../../use-sync-actions";

/** Pull and push for the branch the studio is showing, plus its unsynced-changes indicator. */
export function ContentStudioSyncControls({
  isNavbarOpened,
}: ContentStudioSyncControlsProps) {
  const { worktreeId } = useContentStudioScope();
  const { worktrees, isEnabled } = useWorktrees();
  const mainBranch = useSetting("remote-sync-branch");

  // Falling back to the main branch while the checkout is still loading would pair the main
  // branch name with a worktree id, so a scoped branch is only known once its worktree is.
  const branch =
    worktreeId != null
      ? (worktrees.find((worktree) => worktree.id === worktreeId)?.branch ??
        null)
      : (mainBranch ?? null);

  if (!isEnabled || branch == null) {
    return null;
  }

  return (
    <SyncMenu
      // Switching branches starts over: the menu, modals and remote checks all belong to one branch.
      key={worktreeId ?? "main"}
      branch={branch}
      worktreeId={worktreeId}
      isNavbarOpened={isNavbarOpened}
    />
  );
}

type SyncMenuProps = {
  branch: string;
  worktreeId: RemoteSyncWorktreeId | null;
  isNavbarOpened: boolean;
};

function SyncMenu({ branch, worktreeId, isNavbarOpened }: SyncMenuProps) {
  const dispatch = useDispatch();
  const isReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const isSyncRunning = useSelector(getIsRunning);
  // A sync can also turn out to conflict only once its task is under way; the listener middleware
  // records that here, and only for the main scope.
  const taskConflictVariant = useSelector(getSyncConflictVariant);
  const closeTaskConflict = useCallback(
    () => dispatch(syncConflictVariantUpdated(null)),
    [dispatch],
  );
  const {
    isDirty,
    isPullDisabled,
    isBranchMissing,
    isFetchingRemoteChanges,
    isCheckingPreflight,
    isMenuOpen,
    setIsMenuOpen,
    conflict,
    closeConflict,
    branchMismatchMessage,
    closeBranchMismatch,
    isPushModalOpen,
    closePushModal,
    handlePull,
    handlePush,
  } = useSyncActions({ branch, worktreeId });

  useExportConflictToast();

  return (
    <>
      <Menu position="right-end" opened={isMenuOpen} onChange={setIsMenuOpen}>
        <Menu.Target>
          <Button
            variant="subtle"
            color="text-primary"
            fullWidth
            px="sm"
            justify={isNavbarOpened ? "start" : "center"}
            loading={isCheckingPreflight}
            aria-label={t`Sync`}
            data-testid="content-studio-sync-controls"
            leftSection={<FixedSizeIcon name="sync" />}
            rightSection={isDirty ? <CollectionSyncStatusBadge /> : null}
          >
            {isNavbarOpened && t`Sync`}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {isReadOnly && (
            <Menu.Label maw="18rem">
              {t`This instance is read-only. Content is pulled from ${branch}, not pushed back.`}
            </Menu.Label>
          )}
          <Tooltip
            label={getPullTooltip({
              isBranchMissing,
              isFetchingRemoteChanges,
              isPullDisabled,
              isSyncRunning,
            })}
          >
            <Menu.Item
              leftSection={
                isFetchingRemoteChanges ? (
                  <Loader size={12} data-testid="pull-changes-loader" />
                ) : (
                  <Icon name="download" />
                )
              }
              disabled={isPullDisabled || isSyncRunning}
              onClick={handlePull}
            >
              {t`Pull changes`}
            </Menu.Item>
          </Tooltip>
          {!isReadOnly && (
            <Tooltip label={getPushTooltip({ isDirty, isSyncRunning })}>
              <Menu.Item
                leftSection={<Icon name="upload" />}
                disabled={!isDirty || isSyncRunning}
                onClick={handlePush}
              >
                {t`Push changes`}
              </Menu.Item>
            </Tooltip>
          )}
        </Menu.Dropdown>
      </Menu>

      {isPushModalOpen && (
        <PushChangesModal
          currentBranch={branch}
          worktreeId={worktreeId ?? undefined}
          onClose={closePushModal}
        />
      )}

      {conflict && (
        <SyncConflictModal
          currentBranch={branch}
          worktreeId={worktreeId ?? undefined}
          variant={conflict.variant}
          canMerge={conflict.preflight?.clean}
          conflicts={conflict.preflight?.conflicts}
          forcePushCasualties={conflict.preflight?.force_push_casualties}
          historyRewritten={conflict.preflight?.reason === "history-rewritten"}
          onClose={closeConflict}
        />
      )}

      {!conflict && worktreeId == null && taskConflictVariant && (
        <SyncConflictModal
          currentBranch={branch}
          variant={taskConflictVariant}
          onClose={closeTaskConflict}
        />
      )}

      {branchMismatchMessage && (
        <SyncOutOfDateModal
          message={branchMismatchMessage}
          onClose={closeBranchMismatch}
        />
      )}
    </>
  );
}

function getPullTooltip({
  isBranchMissing,
  isFetchingRemoteChanges,
  isPullDisabled,
  isSyncRunning,
}: {
  isBranchMissing: boolean;
  isFetchingRemoteChanges: boolean;
  isPullDisabled: boolean;
  isSyncRunning: boolean;
}) {
  if (isSyncRunning) {
    return t`A sync is already in progress`;
  }
  if (isBranchMissing) {
    return t`This branch no longer exists on the remote`;
  }
  if (isFetchingRemoteChanges) {
    return t`Checking for changes…`;
  }
  return isPullDisabled ? t`No changes to pull` : t`Pull from remote`;
}

function getPushTooltip({
  isDirty,
  isSyncRunning,
}: {
  isDirty: boolean;
  isSyncRunning: boolean;
}) {
  if (isSyncRunning) {
    return t`A sync is already in progress`;
  }
  return isDirty ? t`Push changes` : t`No changes to push`;
}
