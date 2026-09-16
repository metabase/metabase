import { c, msgid, ngettext, t } from "ttag";

import { ActionButton } from "metabase/common/components/ActionButton";
import { useToast } from "metabase/common/hooks";
import { getUserIsAdmin } from "metabase/current-user";
import { dayjs } from "metabase/dayjs";
import { useSelector } from "metabase/redux";
import { Button, Group, Modal, Progress, Stack, Text } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import { useCancelRemoteSyncCurrentTaskMutation } from "metabase-enterprise/api";
import type {
  RemoteSyncOutcome,
  RemoteSyncTaskType,
  RemoteSyncTaskUser,
} from "metabase-types/api";

import { getProgressPhaseLabel } from "../utils";

interface SyncProgressModalProps {
  taskType: RemoteSyncTaskType;
  progress: number;
  isStalled?: boolean;
  isQuiet?: boolean;
  isCancelled?: boolean;
  minutesSinceLastUpdate?: number | null;
  startedAt?: string | null;
  initiatedByUser?: RemoteSyncTaskUser | null;
  isError: boolean;
  errorMessage: string;
  isSuccess: boolean;
  outcome: RemoteSyncOutcome | null;
  onDismiss: () => void;
}

export function SyncProgressModal({
  progress,
  taskType,
  isStalled = false,
  isQuiet = false,
  isCancelled = false,
  minutesSinceLastUpdate = null,
  startedAt = null,
  initiatedByUser = null,
  isError,
  errorMessage,
  isSuccess,
  outcome,
  onDismiss,
}: SyncProgressModalProps) {
  const isAdmin = useSelector(getUserIsAdmin);

  const [cancelRemoteSyncCurrentTask] =
    useCancelRemoteSyncCurrentTaskMutation();
  const [sendToast] = useToast();

  const onCancel = async () => {
    try {
      await cancelRemoteSyncCurrentTask().unwrap();
      onDismiss();
    } catch (error: any) {
      let message = t`Failed to cancel sync`;

      if (typeof error?.data === "string") {
        message += `: ${error.data}`;
      }

      sendToast({
        message,
        icon: "warning",
        toastColor: "feedback-negative",
        timeout: 60000,
      });

      if (message.match(/no active task/i)) {
        onDismiss();
      }

      throw error;
    }
  };

  const startedBy = (
    <StartedByLine startedAt={startedAt} initiatedByUser={initiatedByUser} />
  );

  if (isError) {
    return (
      <Modal onClose={onDismiss} opened size="md" title={t`Sync failed`}>
        <Stack mt="lg" gap="lg">
          <Text>{t`An error occurred during sync.`}</Text>
          {errorMessage && <Text>{errorMessage}</Text>}
          {startedBy}
          <Group justify="flex-end">
            <Button
              data-testid="sync-error-close-button"
              onClick={onDismiss}
              variant="filled"
            >{t`Close`}</Button>
          </Group>
        </Stack>
      </Modal>
    );
  }

  if (isSuccess) {
    const { successTitle } = getModalContent(taskType);

    return (
      <Modal onClose={onDismiss} opened size="md" title={successTitle}>
        <Stack mt="lg" gap="lg">
          <Text>{getSuccessMessage(outcome, taskType)}</Text>
          <Group justify="flex-end">
            <Button
              data-testid="sync-success-close-button"
              onClick={onDismiss}
              variant="filled"
            >{t`Close`}</Button>
          </Group>
        </Stack>
      </Modal>
    );
  }

  if (isCancelled) {
    return (
      <Modal onClose={onDismiss} opened size="md" title={t`Sync stopped`}>
        <Stack mt="lg" gap="lg">
          <Text>{errorMessage || t`The sync was cancelled.`}</Text>
          <StoppedAtLine progress={progress} taskType={taskType} />
          {startedBy}
          <Group justify="flex-end">
            <Button
              data-testid="sync-cancelled-close-button"
              onClick={onDismiss}
              variant="filled"
            >{t`Close`}</Button>
          </Group>
        </Stack>
      </Modal>
    );
  }

  if (isStalled) {
    return (
      <Modal onClose={onDismiss} opened size="md" title={t`Sync interrupted`}>
        <Stack mt="lg" gap="lg">
          <Text>{getInterruptedMessage(minutesSinceLastUpdate, taskType)}</Text>
          <StoppedAtLine progress={progress} taskType={taskType} />
          {startedBy}
          <Group justify="flex-end">
            <Button
              data-testid="sync-interrupted-close-button"
              onClick={onDismiss}
              variant={isAdmin ? "default" : "filled"}
            >{t`Close`}</Button>
            {isAdmin && (
              <ActionButton
                actionFn={onCancel}
                normalText={t`Clear task`}
                activeText={t`Clearing…`}
                failedText={t`Clear task`}
                variant="filled"
              />
            )}
          </Group>
        </Stack>
      </Modal>
    );
  }

  const { title, progressLabel } = getModalContent(taskType);

  return (
    <Modal
      onClose={onDismiss}
      opened
      size="md"
      title={title}
      withCloseButton={false}
    >
      <Stack mt="lg" gap="lg">
        <Text ta="center">{progressLabel}</Text>
        <Progress value={progress * 100} transitionDuration={300} animated />
        {isQuiet && (
          <Text ta="center">{getQuietMessage(minutesSinceLastUpdate)}</Text>
        )}
        {startedBy}
        <Text size="sm">
          {t`Please wait until this finishes before editing content.`}
        </Text>
        {isAdmin && (
          <Group justify="flex-end">
            <ActionButton
              actionFn={onCancel}
              normalText={t`Cancel`}
              activeText={t`Cancelling…`}
              failedText={t`Cancel`}
            />
          </Group>
        )}
      </Stack>
    </Modal>
  );
}

function StartedByLine({
  startedAt,
  initiatedByUser,
}: {
  startedAt: string | null;
  initiatedByUser: RemoteSyncTaskUser | null;
}) {
  if (!startedAt) {
    return null;
  }

  const time = dayjs(startedAt).format("LT");
  const name = initiatedByUser ? getUserName(initiatedByUser) : null;

  return (
    <Text size="sm" c="text-secondary" data-testid="sync-started-by">
      {name
        ? c("{0} is a person's name, {1} is a time of day")
            .t`Started by ${name} at ${time}`
        : c("{0} is a time of day").t`Started at ${time}`}
    </Text>
  );
}

function StoppedAtLine({
  progress,
  taskType,
}: {
  progress: number;
  taskType: RemoteSyncTaskType;
}) {
  const percent = Math.round(progress * 100);
  const phase = getProgressPhaseLabel(progress, taskType);

  return (
    <Text size="sm" c="text-secondary" data-testid="sync-stopped-at">
      {c("{0} is a percentage, {1} is a sync phase such as 'importing content'")
        .t`Stopped at ${percent}% while ${phase}`}
    </Text>
  );
}

function getQuietMessage(minutesSinceLastUpdate: number | null): string {
  if (minutesSinceLastUpdate == null) {
    return t`No progress reported recently. The sync is still running.`;
  }

  const minutes = minutesSinceLastUpdate;
  return ngettext(
    msgid`No progress for ${minutes} minute. The sync is still running.`,
    `No progress for ${minutes} minutes. The sync is still running.`,
    minutes,
  );
}

function getInterruptedMessage(
  minutesSinceLastUpdate: number | null,
  taskType: RemoteSyncTaskType,
): string {
  const stopped =
    minutesSinceLastUpdate == null
      ? t`The server stopped responding during this sync. It may have restarted.`
      : ngettext(
          msgid`The server stopped responding ${minutesSinceLastUpdate} minute ago. It may have restarted.`,
          `The server stopped responding ${minutesSinceLastUpdate} minutes ago. It may have restarted.`,
          minutesSinceLastUpdate,
        );
  const next =
    taskType === "import"
      ? t`Content pulled before the interruption was kept. Pull again to finish.`
      : t`Push again to retry.`;

  return `${stopped} ${next}`;
}

const getModalContent = (
  taskType: RemoteSyncTaskType,
): {
  title: string;
  progressLabel: string;
  successTitle: string;
} => {
  if (taskType === "import") {
    return {
      title: t`Pulling from Git`,
      progressLabel: t`Importing content…`,
      successTitle: t`Pull complete`,
    };
  }

  return {
    title: t`Pushing to Git`,
    progressLabel: t`Exporting content…`,
    successTitle: t`Push complete`,
  };
};

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isBranch = (value: unknown): value is string => typeof value === "string";

/**
 * Maps a structured sync outcome to a localized confirmation message. Falls back to generic per-task-type
 * copy whenever the outcome is missing, has an unknown `kind`, or is missing the fields that kind needs —
 * so an unrecognized shape never renders a broken message.
 */
function getSuccessMessage(
  outcome: RemoteSyncOutcome | null,
  taskType: RemoteSyncTaskType,
): string {
  switch (outcome?.kind) {
    case "pull-skipped":
      return t`Skipped pull: no changes.`;
    case "push-skipped":
      return t`Skipped push: no changes.`;
    case "pulled":
      return isCount(outcome.count) && isBranch(outcome.branch)
        ? t`Successfully pulled ${outcome.count} changes from ${outcome.branch}.`
        : t`Successfully pulled changes.`;
    case "pushed":
      return isCount(outcome.count) && isBranch(outcome.branch)
        ? t`Successfully pushed ${outcome.count} changes to ${outcome.branch}.`
        : t`Successfully pushed changes.`;
    case "merged":
      return isCount(outcome.pulled) &&
        isCount(outcome.pushed) &&
        isBranch(outcome.branch)
        ? t`Successfully pulled ${outcome.pulled} changes and pushed ${outcome.pushed} changes to ${outcome.branch}.`
        : t`Successfully pulled and pushed changes.`;
    default:
      return taskType === "import"
        ? t`Successfully pulled changes.`
        : t`Successfully pushed changes.`;
  }
}
