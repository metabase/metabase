import { t } from "ttag";

import { Group, Icon, Loader, Text } from "metabase/ui";
import type { Worktree } from "metabase-types/api";

import { useWorktreeSyncActions } from "./use-worktree-sync-actions";

type WorktreeSyncControlsProps = {
  worktree: Worktree;
};

/**
 * Sync status for a worktree, shown in the worktree banner. Owns the worktree's task feedback
 * (progress modal, conflict toasts) while the user is inside the worktree. Pull/push actions live
 * in the worktree's sidebar menu (WorktreesNavSection).
 */
export function WorktreeSyncControls({ worktree }: WorktreeSyncControlsProps) {
  const { isDirty, hasRemoteChanges, isSyncing, modals } =
    useWorktreeSyncActions(worktree);

  return (
    <Group gap="md">
      <SyncStatusLabel isDirty={isDirty} hasRemoteChanges={hasRemoteChanges} />

      {isSyncing && <Loader size="xs" data-testid="worktree-sync-loader" />}

      {/* Pull/push buttons, currently only exposed via the sidebar worktree menu:

      {!isSyncing && (
        <Group gap="sm">
          <Tooltip
            label={
              hasRemoteChanges ? t`Pull from remote` : t`No changes to pull`
            }
          >
            <Button
              size="compact-sm"
              variant="subtle"
              disabled={isPullDisabled || isFetchingRemoteChanges}
              leftSection={<Icon name="arrow_down" size={12} />}
              onClick={pull}
              data-testid="worktree-pull-button"
            >
              {t`Pull`}
            </Button>
          </Tooltip>

          {!isReadOnly && (
            <Tooltip label={isDirty ? t`Push changes` : t`No changes to push`}>
              <Button
                size="compact-sm"
                variant="subtle"
                disabled={isPushDisabled}
                leftSection={<Icon name="arrow_up" size={12} />}
                onClick={push}
                data-testid="worktree-push-button"
              >
                {t`Push`}
              </Button>
            </Tooltip>
          )}
        </Group>
      )}
      */}

      {modals}
    </Group>
  );
}

type SyncStatusLabelProps = {
  isDirty: boolean;
  hasRemoteChanges: boolean;
};

function SyncStatusLabel({ isDirty, hasRemoteChanges }: SyncStatusLabelProps) {
  return (
    <Group gap="md">
      {hasRemoteChanges && (
        <Group gap="xs" data-testid="worktree-incoming-changes">
          <Icon name="arrow_down" c="core-brand" size={12} />
          <Text c="core-brand" size="sm">
            {t`Remote changes to pull`}
          </Text>
        </Group>
      )}
      <Text c="text-secondary" size="sm" data-testid="worktree-sync-status">
        {isDirty ? t`Uncommitted changes` : t`Up to date`}
      </Text>
    </Group>
  );
}
