import { msgid, ngettext, t } from "ttag";

import { ActionButton } from "metabase/common/components/ActionButton";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, Group, Progress, Stack, Text } from "metabase/ui";
import { useCancelRemoteSyncCurrentTaskMutation } from "metabase-enterprise/api";
import type { RemoteSyncOutcome, RemoteSyncTaskType } from "metabase-types/api";

export interface SyncProgressStateProps {
  taskType: RemoteSyncTaskType;
  progress: number;
  isStalled?: boolean;
  minutesSinceLastUpdate?: number | null;
  isError: boolean;
  errorMessage: string;
  isSuccess: boolean;
  outcome: RemoteSyncOutcome | null;
}

export interface SyncProgressViewProps extends SyncProgressStateProps {
  onDismiss: () => void;
}

/**
 * The body of the sync-status modal, without the surrounding `Modal` chrome. Extracted so it can be
 * hosted both by the standalone {@link SyncProgressModal} and inline by flows (e.g. EnterWorkspaceModal)
 * that swap their own modal body from a form to the pull progress.
 */
export function SyncProgressView({
  progress,
  taskType,
  isStalled = false,
  minutesSinceLastUpdate = null,
  isError,
  errorMessage,
  isSuccess,
  outcome,
  onDismiss,
}: SyncProgressViewProps) {
  const canCancel = useSelector(getUserIsAdmin);

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
      });

      if (message.match(/no active task/i)) {
        onDismiss();
      }

      throw error;
    }
  };

  if (isError) {
    return (
      <Stack mt="md" gap="md">
        <Text>{t`An error occurred during sync.`}</Text>
        {errorMessage && <Text>{errorMessage}</Text>}
        <Group justify="flex-end">
          <Button
            data-testid="sync-error-close-button"
            onClick={onDismiss}
            variant="filled"
          >{t`Close`}</Button>
        </Group>
      </Stack>
    );
  }

  if (isSuccess) {
    return (
      <Stack mt="md" gap="md">
        <Text>{getSuccessMessage(outcome, taskType)}</Text>
        <Group justify="flex-end">
          <Button
            data-testid="sync-success-close-button"
            onClick={onDismiss}
            variant="filled"
          >{t`Close`}</Button>
        </Group>
      </Stack>
    );
  }

  const { progressLabel } = getModalContent(taskType);

  return (
    <Stack mt="md" gap="md">
      {isStalled ? (
        <Text ta="center">{getStalledMessage(minutesSinceLastUpdate)}</Text>
      ) : (
        <>
          <Text ta="center">{progressLabel}</Text>
          <Progress value={progress * 100} transitionDuration={300} animated />
        </>
      )}
      <Text size="sm">
        {t`Please wait until this finishes before editing content.`}
      </Text>
      {canCancel && (
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
  );
}

/** Title for the modal hosting {@link SyncProgressView}, given the current task state. */
export function getSyncProgressTitle({
  taskType,
  isError,
  isSuccess,
}: Pick<SyncProgressStateProps, "taskType" | "isError" | "isSuccess">): string {
  if (isError) {
    return t`Sync failed`;
  }
  if (isSuccess) {
    return getModalContent(taskType).successTitle;
  }
  return getModalContent(taskType).title;
}

/** A running sync must not be dismissed via the corner close button; a finished one may be. */
export function getSyncProgressShowCloseButton({
  isError,
  isSuccess,
}: Pick<SyncProgressStateProps, "isError" | "isSuccess">): boolean {
  return isError || isSuccess;
}

function getStalledMessage(minutesSinceLastUpdate: number | null): string {
  if (minutesSinceLastUpdate == null) {
    return t`Still working…`;
  }

  const minutes = minutesSinceLastUpdate;
  return ngettext(
    msgid`Still working. No update for ${minutes} minute.`,
    `Still working. No update for ${minutes} minutes.`,
    minutes,
  );
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
