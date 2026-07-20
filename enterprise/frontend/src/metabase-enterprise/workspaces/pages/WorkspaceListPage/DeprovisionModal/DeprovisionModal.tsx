import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  Button,
  FixedSizeIcon,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import {
  useDeprovisionWorkspaceMutation,
  useGetWorkspaceQuery,
} from "metabase-enterprise/api";
import type { Workspace, WorkspaceId } from "metabase-types/api";

import { POLLING_INTERVAL } from "../../../constants";
import {
  getStatusMessage,
  isDeprovisioned,
  isDeprovisioning,
  isDeprovisioningFailed,
} from "../../../utils";
import { StatusDetails } from "../StatusDetails";

type DeprovisionModalProps = {
  workspaceId: WorkspaceId;
  opened: boolean;
  onClose: () => void;
};

export function DeprovisionModal({
  workspaceId,
  opened,
  onClose,
}: DeprovisionModalProps) {
  return (
    <Modal
      title={t`Deprovision workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <DeprovisionModalBody workspaceId={workspaceId} onClose={onClose} />
    </Modal>
  );
}

type DeprovisionModalBodyProps = {
  workspaceId: WorkspaceId;
  onClose: () => void;
};

function DeprovisionModalBody({
  workspaceId,
  onClose,
}: DeprovisionModalBodyProps) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [deprovisionWorkspace, { isLoading }] =
    useDeprovisionWorkspaceMutation();
  const { data: workspace } = useGetWorkspaceQuery(workspaceId, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  useEffect(() => {
    setIsPolling(workspace != null && isDeprovisioning(workspace));
  }, [workspace]);

  const handleDeprovision = () => {
    setIsConfirmed(true);
    deprovisionWorkspace(workspaceId);
  };

  if (!isConfirmed || workspace == null) {
    return (
      <ConfirmDeprovision
        disabled={workspace == null}
        onDeprovision={handleDeprovision}
        onCancel={onClose}
      />
    );
  }

  if (isDeprovisioned(workspace)) {
    return <DeprovisionSuccess onDone={onClose} />;
  }

  return (
    <DeprovisionProgress
      workspace={workspace}
      isDeprovisioning={isLoading}
      onDeprovision={handleDeprovision}
      onClose={onClose}
    />
  );
}

type ConfirmDeprovisionProps = {
  disabled: boolean;
  onDeprovision: () => void;
  onCancel: () => void;
};

function ConfirmDeprovision({
  disabled,
  onDeprovision,
  onCancel,
}: ConfirmDeprovisionProps) {
  return (
    <Stack gap="lg">
      <Text>{t`This will delete the workspace instance and the temporary database users and schemas that were created for this workspace.`}</Text>
      <Group justify="flex-end">
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          color="feedback-negative"
          disabled={disabled}
          onClick={onDeprovision}
        >
          {t`Deprovision`}
        </Button>
      </Group>
    </Stack>
  );
}

type DeprovisionProgressProps = {
  workspace: Workspace;
  isDeprovisioning: boolean;
  onDeprovision: () => void;
  onClose: () => void;
};

function DeprovisionProgress({
  workspace,
  isDeprovisioning,
  onDeprovision,
  onClose,
}: DeprovisionProgressProps) {
  const isFailed = isDeprovisioningFailed(workspace);

  return (
    <Stack gap="lg">
      <Group gap="sm" wrap="nowrap">
        {isFailed ? (
          <FixedSizeIcon name="warning" c="feedback-negative" aria-hidden />
        ) : (
          <Loader size="sm" />
        )}
        <Text>{getStatusMessage(workspace.status)}</Text>
      </Group>
      {isFailed && workspace.status_details != null && (
        <StatusDetails details={workspace.status_details} />
      )}
      <Group justify="flex-end">
        {isFailed && <Button onClick={onClose}>{t`Close`}</Button>}
        <Button
          variant="filled"
          color="feedback-negative"
          disabled={!isFailed || isDeprovisioning}
          onClick={onDeprovision}
        >
          {t`Deprovision`}
        </Button>
      </Group>
    </Stack>
  );
}

type DeprovisionSuccessProps = {
  onDone: () => void;
};

function DeprovisionSuccess({ onDone }: DeprovisionSuccessProps) {
  return (
    <Stack gap="lg">
      <Text>{t`The workspace instance and its temporary database users and schemas were removed.`}</Text>
      <Group justify="flex-end">
        <Button variant="filled" onClick={onDone}>
          {t`Done`}
        </Button>
      </Group>
    </Stack>
  );
}
