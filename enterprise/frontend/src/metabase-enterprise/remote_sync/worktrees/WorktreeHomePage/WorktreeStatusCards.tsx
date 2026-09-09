import type { ReactNode } from "react";
import { msgid, ngettext, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import {
  Card,
  FixedSizeIcon,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type { IconName, RemoteSyncTask, Worktree } from "metabase-types/api";

import {
  type ChangeCounts,
  getSyncTaskSummary,
  isFailedSyncTask,
} from "./utils";

type WorktreeStatusCardsProps = {
  worktree: Worktree;
  counts: ChangeCounts;
  isLoadingChanges: boolean;
  hasRemoteChanges: boolean;
  isCheckingRemote: boolean;
  isSyncing: boolean;
  lastTask: RemoteSyncTask | null | undefined;
  isLoadingLastTask: boolean;
};

export function WorktreeStatusCards({
  worktree,
  counts,
  isLoadingChanges,
  hasRemoteChanges,
  isCheckingRemote,
  isSyncing,
  lastTask,
  isLoadingLastTask,
}: WorktreeStatusCardsProps) {
  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
      <LocalChangesCard
        counts={counts}
        isLoading={isLoadingChanges}
        isSyncing={isSyncing}
      />
      <RemoteBranchCard
        hasRemoteChanges={hasRemoteChanges}
        isChecking={isCheckingRemote}
      />
      <LastSyncCard
        worktree={worktree}
        task={lastTask}
        isLoading={isLoadingLastTask}
      />
    </SimpleGrid>
  );
}

type StatusCardProps = {
  label: string;
  children: ReactNode;
  "data-testid"?: string;
};

function StatusCard({
  label,
  children,
  "data-testid": dataTestId,
}: StatusCardProps) {
  return (
    <Card withBorder shadow="none" p="lg" data-testid={dataTestId}>
      <Stack gap="sm">
        <Text size="sm" fw="bold" c="text-secondary">
          {label}
        </Text>
        {children}
      </Stack>
    </Card>
  );
}

type StatusLineProps = {
  icon: IconName;
  color: ColorName;
  children: ReactNode;
};

function StatusLine({ icon, color, children }: StatusLineProps) {
  return (
    <Group gap="sm" wrap="nowrap">
      <FixedSizeIcon name={icon} c={color} />
      <Text fw="bold" lh="md">
        {children}
      </Text>
    </Group>
  );
}

function PendingLine({ children }: { children: ReactNode }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Loader size="xs" />
      <Text c="text-secondary" lh="md">
        {children}
      </Text>
    </Group>
  );
}

type LocalChangesCardProps = {
  counts: ChangeCounts;
  isLoading: boolean;
  isSyncing: boolean;
};

function LocalChangesCard({
  counts,
  isLoading,
  isSyncing,
}: LocalChangesCardProps) {
  const total = counts.added + counts.modified + counts.removed;

  return (
    <StatusCard label={t`Local changes`} data-testid="worktree-local-changes">
      {isSyncing ? (
        <PendingLine>{t`Syncing…`}</PendingLine>
      ) : isLoading ? (
        <PendingLine>{t`Checking for changes…`}</PendingLine>
      ) : total === 0 ? (
        <StatusLine icon="check" color="feedback-positive">
          {t`Nothing to push`}
        </StatusLine>
      ) : (
        <>
          <Group gap="xs" align="baseline" wrap="nowrap">
            <Title order={2} lh={1}>
              {total}
            </Title>
            <Text c="text-secondary">
              {ngettext(msgid`change to push`, `changes to push`, total)}
            </Text>
          </Group>
          <ChangeCountsLine counts={counts} />
        </>
      )}
    </StatusCard>
  );
}

function ChangeCountsLine({ counts }: { counts: ChangeCounts }) {
  const parts = [
    counts.added > 0 && (
      <Text key="added" size="sm" c="feedback-positive" fw="bold">
        {t`${counts.added} added`}
      </Text>
    ),
    counts.modified > 0 && (
      <Text key="modified" size="sm" c="core-blue-saturated" fw="bold">
        {t`${counts.modified} modified`}
      </Text>
    ),
    counts.removed > 0 && (
      <Text key="removed" size="sm" c="feedback-negative" fw="bold">
        {t`${counts.removed} removed`}
      </Text>
    ),
  ].filter(Boolean);

  return (
    <Group gap="md" wrap="wrap">
      {parts}
    </Group>
  );
}

type RemoteBranchCardProps = {
  hasRemoteChanges: boolean;
  isChecking: boolean;
};

function RemoteBranchCard({
  hasRemoteChanges,
  isChecking,
}: RemoteBranchCardProps) {
  return (
    <StatusCard label={t`Remote branch`} data-testid="worktree-remote-branch">
      {isChecking ? (
        <PendingLine>{t`Checking the remote…`}</PendingLine>
      ) : hasRemoteChanges ? (
        <StatusLine icon="arrow_down" color="feedback-warning">
          {t`New commits to pull`}
        </StatusLine>
      ) : (
        <StatusLine icon="check" color="feedback-positive">
          {t`Up to date with remote`}
        </StatusLine>
      )}
    </StatusCard>
  );
}

type LastSyncCardProps = {
  worktree: Worktree;
  task: RemoteSyncTask | null | undefined;
  isLoading: boolean;
};

function LastSyncCard({ worktree, task, isLoading }: LastSyncCardProps) {
  const creatorName = worktree.creator?.common_name;

  return (
    <StatusCard label={t`Last sync`} data-testid="worktree-last-sync">
      {isLoading ? (
        <PendingLine>{t`Loading…`}</PendingLine>
      ) : task == null ? (
        <StatusLine icon="info" color="text-secondary">
          {t`Never synced`}
        </StatusLine>
      ) : task.ended_at == null ? (
        <PendingLine>{getSyncTaskSummary(task)}</PendingLine>
      ) : (
        <StatusLine
          icon={isFailedSyncTask(task) ? "warning" : "check"}
          color={
            isFailedSyncTask(task) ? "feedback-negative" : "feedback-positive"
          }
        >
          {getSyncTaskSummary(task)}
        </StatusLine>
      )}
      <Text size="sm" c="text-secondary">
        {task?.ended_at != null ? (
          <DateTime value={task.ended_at} />
        ) : creatorName != null ? (
          t`Created by ${creatorName}`
        ) : (
          <>
            {t`Created`} <DateTime value={worktree.created_at} />
          </>
        )}
      </Text>
    </StatusCard>
  );
}
