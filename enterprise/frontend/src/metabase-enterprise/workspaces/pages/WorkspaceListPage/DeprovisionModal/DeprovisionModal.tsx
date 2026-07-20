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
import { useDeprovisionWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import {
  getStatusMessage,
  isDeprovisioned,
  isDeprovisioning,
  isDeprovisioningFailed,
} from "../../../utils";
import { StatusDetails } from "../StatusDetails";

type DeprovisionStep = "confirm" | "progress" | "success";

type DeprovisionModalProps = {
  workspace: Workspace;
  opened: boolean;
  onClose: () => void;
};

export function DeprovisionModal({
  workspace,
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
      <DeprovisionModalBody workspace={workspace} onClose={onClose} />
    </Modal>
  );
}

function getInitialStep(workspace: Workspace): DeprovisionStep {
  if (isDeprovisioned(workspace)) {
    return "success";
  }
  if (isDeprovisioning(workspace)) {
    return "progress";
  }
  return "confirm";
}

type DeprovisionModalBodyProps = {
  workspace: Workspace;
  onClose: () => void;
};

function DeprovisionModalBody({
  workspace,
  onClose,
}: DeprovisionModalBodyProps) {
  const [deprovisionWorkspace, { isLoading }] =
    useDeprovisionWorkspaceMutation();
  const [step, setStep] = useState(() => getInitialStep(workspace));

  useEffect(() => {
    if (step === "progress" && isDeprovisioned(workspace)) {
      setStep("success");
    }
  }, [step, workspace]);

  const handleDeprovision = () => {
    setStep("progress");
    deprovisionWorkspace(workspace.id);
  };

  switch (step) {
    case "confirm":
      return (
        <ConfirmDeprovision
          onDeprovision={handleDeprovision}
          onCancel={onClose}
        />
      );
    case "progress":
      return (
        <DeprovisionProgress
          workspace={workspace}
          isDeprovisioning={isLoading}
          onDeprovision={handleDeprovision}
          onClose={onClose}
        />
      );
    case "success":
      return <DeprovisionSuccess onDone={onClose} />;
  }
}

type ConfirmDeprovisionProps = {
  onDeprovision: () => void;
  onCancel: () => void;
};

function ConfirmDeprovision({
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
      <Group gap="sm" wrap="nowrap">
        <FixedSizeIcon name="check_filled" c="success" aria-hidden />
        <Text>{t`The workspace instance and its temporary database users and schemas were removed.`}</Text>
      </Group>
      <Group justify="flex-end">
        <Button variant="filled" onClick={onDone}>
          {t`Done`}
        </Button>
      </Group>
    </Stack>
  );
}
