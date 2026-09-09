import type { ReactNode } from "react";
import { msgid, ngettext, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { getHowLongAgo } from "metabase/common/components/LastEditInfoLabel/LastEditInfoLabel";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { Box, Group, Icon, Loader, Tooltip } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type { IconName, RemoteSyncTask, Worktree } from "metabase-types/api";

import S from "./WorktreeSyncStatus.module.css";
import {
  type ChangeCounts,
  getSyncTaskSummary,
  isFailedSyncTask,
} from "./utils";

type WorktreeSyncStatusProps = {
  worktree: Worktree;
  counts: ChangeCounts;
  isLoadingChanges: boolean;
  hasRemoteChanges: boolean;
  isCheckingRemote: boolean;
  isSyncing: boolean;
  lastTask: RemoteSyncTask | null | undefined;
  isLoadingLastTask: boolean;
};

export function WorktreeSyncStatus({
  worktree,
  counts,
  isLoadingChanges,
  hasRemoteChanges,
  isCheckingRemote,
  isSyncing,
  lastTask,
  isLoadingLastTask,
}: WorktreeSyncStatusProps) {
  return (
    <TitleSection label={t`Sync status`} data-testid="worktree-sync-status">
      {/* Three columns on wide screens, stacked with separators between them on narrow ones. */}
      <Box className={S.grid}>
        <LocalChangesStatus
          counts={counts}
          isLoading={isLoadingChanges}
          isSyncing={isSyncing}
        />
        <RemoteBranchStatus
          hasRemoteChanges={hasRemoteChanges}
          isChecking={isCheckingRemote}
        />
        <LastSyncStatus
          worktree={worktree}
          task={lastTask}
          isLoading={isLoadingLastTask}
        />
      </Box>
    </TitleSection>
  );
}

type StatusRowProps = {
  icon?: IconName;
  color?: ColorName;
  isPending?: boolean;
  detail?: ReactNode;
  children: ReactNode;
  "data-testid"?: string;
};

// The same shape as the run status line on a transform's run page: an icon, a sentence, and
// optional secondary detail after it. The detail wraps under the sentence when the column is narrow.
function StatusRow({
  icon = "info",
  color = "text-secondary",
  isPending = false,
  detail,
  children,
  "data-testid": dataTestId,
}: StatusRowProps) {
  return (
    <Group
      p="xl"
      gap="sm"
      wrap="nowrap"
      align="flex-start"
      className={S.cell}
      data-testid={dataTestId}
    >
      {isPending ? <Loader size="xs" /> : <Icon name={icon} c={color} />}
      <Group gap="sm" miw={0}>
        <Box>{children}</Box>
        {detail != null && <Box c="text-secondary">{detail}</Box>}
      </Group>
    </Group>
  );
}

type LocalChangesStatusProps = {
  counts: ChangeCounts;
  isLoading: boolean;
  isSyncing: boolean;
};

function LocalChangesStatus({
  counts,
  isLoading,
  isSyncing,
}: LocalChangesStatusProps) {
  const testId = "worktree-local-changes";
  const total = counts.added + counts.modified + counts.removed;

  if (isSyncing) {
    return (
      <StatusRow isPending data-testid={testId}>
        {t`Syncing…`}
      </StatusRow>
    );
  }
  if (isLoading) {
    return (
      <StatusRow isPending data-testid={testId}>
        {t`Checking for changes…`}
      </StatusRow>
    );
  }
  if (total === 0) {
    return (
      <StatusRow
        icon="check_filled"
        color="feedback-positive"
        data-testid={testId}
      >
        {t`Nothing to push`}
      </StatusRow>
    );
  }
  return (
    <StatusRow
      icon="arrow_up"
      color="core-brand"
      detail={getChangeBreakdown(counts)}
      data-testid={testId}
    >
      {ngettext(
        msgid`${total} change to push`,
        `${total} changes to push`,
        total,
      )}
    </StatusRow>
  );
}

function getChangeBreakdown({ added, modified, removed }: ChangeCounts) {
  const parts: string[] = [];
  if (added > 0) {
    parts.push(t`${added} added`);
  }
  if (modified > 0) {
    parts.push(t`${modified} modified`);
  }
  if (removed > 0) {
    parts.push(t`${removed} removed`);
  }
  return parts.join(", ");
}

type RemoteBranchStatusProps = {
  hasRemoteChanges: boolean;
  isChecking: boolean;
};

function RemoteBranchStatus({
  hasRemoteChanges,
  isChecking,
}: RemoteBranchStatusProps) {
  const testId = "worktree-remote-branch";

  if (isChecking) {
    return (
      <StatusRow isPending data-testid={testId}>
        {t`Checking the remote…`}
      </StatusRow>
    );
  }
  if (hasRemoteChanges) {
    return (
      <StatusRow icon="arrow_down" color="core-brand" data-testid={testId}>
        {t`New commits to pull`}
      </StatusRow>
    );
  }
  return (
    <StatusRow
      icon="check_filled"
      color="feedback-positive"
      data-testid={testId}
    >
      {t`Up to date with the remote`}
    </StatusRow>
  );
}

type LastSyncStatusProps = {
  worktree: Worktree;
  task: RemoteSyncTask | null | undefined;
  isLoading: boolean;
};

function LastSyncStatus({ worktree, task, isLoading }: LastSyncStatusProps) {
  const testId = "worktree-last-sync";

  if (isLoading) {
    return (
      <StatusRow isPending data-testid={testId}>
        {t`Loading…`}
      </StatusRow>
    );
  }
  if (task == null) {
    const creatorName = worktree.creator?.common_name;
    return (
      <StatusRow
        icon="calendar"
        detail={
          creatorName != null ? (
            t`Created by ${creatorName}`
          ) : (
            <>
              {t`Created`} <RelativeTime value={worktree.created_at} />
            </>
          )
        }
        data-testid={testId}
      >
        {t`Never synced`}
      </StatusRow>
    );
  }
  if (task.ended_at == null) {
    return (
      <StatusRow isPending data-testid={testId}>
        {getSyncTaskSummary(task)}
      </StatusRow>
    );
  }
  const isFailed = isFailedSyncTask(task);
  return (
    <StatusRow
      icon={isFailed ? "warning" : "check_filled"}
      color={isFailed ? "feedback-negative" : "feedback-positive"}
      detail={<RelativeTime value={task.ended_at} />}
      data-testid={testId}
    >
      {getSyncTaskSummary(task)}
    </StatusRow>
  );
}

/** "2 hours ago", with the full date on hover, the way the last-edit labels show it. */
function RelativeTime({ value }: { value: string }) {
  return (
    <Tooltip label={<DateTime value={value} />}>
      <span>{getHowLongAgo(value)}</span>
    </Tooltip>
  );
}
