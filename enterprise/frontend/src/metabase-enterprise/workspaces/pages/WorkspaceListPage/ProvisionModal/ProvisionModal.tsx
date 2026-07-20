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
import { useProvisionWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import {
  getStatusMessage,
  isProvisioned,
  isProvisioning,
  isProvisioningFailed,
} from "../../../utils";
import { StatusDetails } from "../StatusDetails";

type ProvisionStep = "confirm" | "progress" | "success";

type ProvisionModalProps = {
  workspace: Workspace;
  opened: boolean;
  onClose: () => void;
};

export function ProvisionModal({
  workspace,
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
      <ProvisionModalBody workspace={workspace} onClose={onClose} />
    </Modal>
  );
}

function getInitialStep(workspace: Workspace): ProvisionStep {
  if (isProvisioned(workspace)) {
    return "success";
  }
  if (isProvisioning(workspace)) {
    return "progress";
  }
  return "confirm";
}

type ProvisionModalBodyProps = {
  workspace: Workspace;
  onClose: () => void;
};

function ProvisionModalBody({ workspace, onClose }: ProvisionModalBodyProps) {
  const [provisionWorkspace, { isLoading }] = useProvisionWorkspaceMutation();
  const [step, setStep] = useState(() => getInitialStep(workspace));

  useEffect(() => {
    if (step === "progress" && isProvisioned(workspace)) {
      setStep("success");
    }
  }, [step, workspace]);

  const handleProvision = () => {
    setStep("progress");
    provisionWorkspace(workspace.id);
  };

  switch (step) {
    case "confirm":
      return (
        <ConfirmProvision onProvision={handleProvision} onCancel={onClose} />
      );
    case "progress":
      return (
        <ProvisionProgress
          workspace={workspace}
          isProvisioning={isLoading}
          onProvision={handleProvision}
          onClose={onClose}
        />
      );
    case "success":
      return <ProvisionSuccess workspace={workspace} onDone={onClose} />;
  }
}

type ConfirmProvisionProps = {
  onProvision: () => void;
  onCancel: () => void;
};

function ConfirmProvision({ onProvision, onCancel }: ConfirmProvisionProps) {
  return (
    <Stack gap="lg">
      <Text>{t`This will set up temporary database users and schemas and a workspace instance.`}</Text>
      <Group justify="flex-end">
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button variant="filled" onClick={onProvision}>
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
