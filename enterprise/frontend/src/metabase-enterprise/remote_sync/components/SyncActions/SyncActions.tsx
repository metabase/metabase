import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useSetting } from "metabase/settings";
import { Button, Divider, Group, Stack, Text } from "metabase/ui";
import {
  useImportChangesMutation,
  useUpdateRemoteSyncSettingsMutation,
} from "metabase-enterprise/api";
import type { RemoteSyncTaskId } from "metabase-types/api";

import { trackPullChanges, trackRemoteSyncDeactivated } from "../../analytics";
import { SyncTaskModal } from "../SyncTaskModal";

// Pull-now and turn-off actions, shown under Advanced on the settings page.
export function SyncActions() {
  const isEnabled = useSetting("remote-sync-enabled");
  const syncType = useSetting("remote-sync-type");

  if (!isEnabled) {
    return null;
  }

  return (
    <Stack gap="lg">
      {syncType === "read-only" && (
        <>
          <ActionRow
            title={t`Pull changes now`}
            description={t`Get the latest content from the branch without waiting for the next automatic pull.`}
            action={<PullButton />}
          />
          <Divider />
        </>
      )}
      <ActionRow
        title={t`Turn off git integration`}
        description={t`Content stays on this instance, but it won't sync with the repository any more.`}
        action={<DisableButton />}
      />
    </Stack>
  );
}

type ActionRowProps = {
  title: string;
  description: string;
  action: ReactNode;
};

function ActionRow({ title, description, action }: ActionRowProps) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="lg">
      <Stack gap="xs">
        <Text fw="bold">{title}</Text>
        <Text c="text-secondary" size="sm">
          {description}
        </Text>
      </Stack>
      {action}
    </Group>
  );
}

function PullButton() {
  const [importChanges, { isLoading }] = useImportChangesMutation();
  const [taskId, setTaskId] = useState<RemoteSyncTaskId | null>(null);
  const [sendToast] = useToast();

  const handleClick = async () => {
    try {
      const { task_id } = await importChanges({ force: true }).unwrap();
      trackPullChanges({ triggeredFrom: "admin-settings", force: true });
      if (task_id != null) {
        setTaskId(task_id);
      }
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't pull changes`),
        variant: "negative",
      });
    }
  };

  return (
    <>
      <Button flex="none" loading={isLoading} onClick={handleClick}>
        {t`Pull changes now`}
      </Button>
      <SyncTaskModal
        title={t`Pulling changes`}
        taskId={taskId}
        onClose={() => setTaskId(null)}
      />
    </>
  );
}

function DisableButton() {
  const [updateSettings, { isLoading }] = useUpdateRemoteSyncSettingsMutation();
  const { show: showConfirmation, modalContent } = useConfirmation();

  const handleClick = () =>
    showConfirmation({
      title: t`Turn off git integration?`,
      message: t`Content stays on this instance, but it won't sync with the repository any more.`,
      confirmButtonText: t`Turn off`,
      onConfirm: async () => {
        await updateSettings({ "remote-sync-url": null }).unwrap();
        trackRemoteSyncDeactivated();
      },
    });

  return (
    <>
      <Button flex="none" loading={isLoading} onClick={handleClick}>
        {t`Turn off git integration`}
      </Button>
      {modalContent}
    </>
  );
}
