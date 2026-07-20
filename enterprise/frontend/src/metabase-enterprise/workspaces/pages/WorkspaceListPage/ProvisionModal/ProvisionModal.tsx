import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  Anchor,
  Button,
  FixedSizeIcon,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import {
  useGetWorkspaceQuery,
  useProvisionWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Workspace, WorkspaceId } from "metabase-types/api";

import { POLLING_INTERVAL } from "../../../constants";
import {
  getStatusMessage,
  isProvisioned,
  isProvisioning,
  isProvisioningFailed,
} from "../../../utils";
import { StatusDetails } from "../StatusDetails";

type ProvisionModalProps = {
  workspaceId: WorkspaceId;
  opened: boolean;
  onClose: () => void;
};

export function ProvisionModal({
  workspaceId,
  opened,
  onClose,
}: ProvisionModalProps) {
  return (
    <Modal
      title={t`Provision workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <ProvisionModalBody workspaceId={workspaceId} onClose={onClose} />
    </Modal>
  );
}

type ProvisionModalBodyProps = {
  workspaceId: WorkspaceId;
  onClose: () => void;
};

function ProvisionModalBody({ workspaceId, onClose }: ProvisionModalBodyProps) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [provisionWorkspace, { isLoading }] = useProvisionWorkspaceMutation();
  const { data: workspace } = useGetWorkspaceQuery(workspaceId, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  useEffect(() => {
    setIsPolling(workspace != null && isProvisioning(workspace));
  }, [workspace]);

  const handleProvision = () => {
    setIsConfirmed(true);
    provisionWorkspace(workspaceId);
  };

  if (!isConfirmed || workspace == null) {
    return (
      <ConfirmProvision
        disabled={workspace == null}
        onProvision={handleProvision}
        onCancel={onClose}
      />
    );
  }

  if (isProvisioned(workspace)) {
    return <ProvisionSuccess workspace={workspace} onDone={onClose} />;
  }

  return (
    <ProvisionProgress
      workspace={workspace}
      isProvisioning={isLoading}
      onProvision={handleProvision}
      onClose={onClose}
    />
  );
}

type ConfirmProvisionProps = {
  disabled: boolean;
  onProvision: () => void;
  onCancel: () => void;
};

function ConfirmProvision({
  disabled,
  onProvision,
  onCancel,
}: ConfirmProvisionProps) {
  return (
    <Stack gap="lg">
      <Text>{t`This will set up temporary database users and schemas and a workspace instance.`}</Text>
      <Group justify="flex-end">
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button variant="filled" disabled={disabled} onClick={onProvision}>
          {t`Provision`}
        </Button>
      </Group>
    </Stack>
  );
}

type ProvisionProgressProps = {
  workspace: Workspace;
  isProvisioning: boolean;
  onProvision: () => void;
  onClose: () => void;
};

export function ProvisionProgress({
  workspace,
  isProvisioning,
  onProvision,
  onClose,
}: ProvisionProgressProps) {
  const isFailed = isProvisioningFailed(workspace);

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
          disabled={!isFailed || isProvisioning}
          onClick={onProvision}
        >
          {t`Provision`}
        </Button>
      </Group>
    </Stack>
  );
}

type ProvisionSuccessProps = {
  workspace: Workspace;
  onDone: () => void;
};

export function ProvisionSuccess({ workspace, onDone }: ProvisionSuccessProps) {
  return (
    <Stack gap="lg">
      <Group gap="sm" wrap="nowrap">
        <FixedSizeIcon name="check_filled" c="success" aria-hidden />
        <Text>{t`The workspace is ready.`}</Text>
      </Group>
      {workspace.instance_url != null && (
        <Group gap="xs" wrap="nowrap">
          <FixedSizeIcon name="workspace" c="text-secondary" aria-hidden />
          <Anchor
            href={workspace.instance_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {workspace.instance_url}
          </Anchor>
        </Group>
      )}
      <Group justify="flex-end">
        <Button variant="filled" onClick={onDone}>
          {t`Done`}
        </Button>
      </Group>
    </Stack>
  );
}
