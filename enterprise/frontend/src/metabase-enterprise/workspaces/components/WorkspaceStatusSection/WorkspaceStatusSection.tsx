import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Icon, type IconName, Text } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors";
import {
  useProvisionWorkspaceMutation,
  useUnprovisionWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import {
  isWorkspaceProvisioned,
  isWorkspaceProvisioning,
  isWorkspaceUnprovisioning,
} from "../../utils";
import { TitleSection } from "../TitleSection";

type WorkspaceStatusSectionProps = {
  workspace: Workspace;
};

export function WorkspaceStatusSection({
  workspace,
}: WorkspaceStatusSectionProps) {
  const { modalContent, show } = useConfirmation();
  const [provisionWorkspace] = useProvisionWorkspaceMutation();
  const [unprovisionWorkspace] = useUnprovisionWorkspaceMutation();
  const { sendErrorToast } = useMetadataToasts();

  const isProvisioning = isWorkspaceProvisioning(workspace);
  const isUnprovisioning = isWorkspaceUnprovisioning(workspace);
  const isProvisioned = isWorkspaceProvisioned(workspace);
  const isInProgress = isProvisioning || isUnprovisioning;

  const { name: iconName, color: iconColor } = getStatusIcon(workspace);
  const message = getStatusMessage(workspace);

  const handleProvision = () => {
    show({
      title: t`Provision this workspace?`,
      message: t`Provisioning creates a temporary schema in each database to run transforms in isolation, and creates a user with read-only access to the selected schemas and write access to the workspace schema.`,
      confirmButtonText: t`Provision workspace`,
      confirmButtonProps: { variant: "filled", color: "brand" },
      onConfirm: async () => {
        const { error } = await provisionWorkspace(workspace.id);
        if (error) {
          sendErrorToast(t`Failed to provision workspace`);
        }
      },
    });
  };

  const handleUnprovision = () => {
    show({
      title: t`Unprovision this workspace?`,
      message: t`Unprovisioning deletes the workspace user and the temporary schema from each database.`,
      confirmButtonText: t`Unprovision workspace`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        const { error } = await unprovisionWorkspace(workspace.id);
        if (error) {
          sendErrorToast(t`Failed to unprovision workspace`);
        }
      },
    });
  };

  const buttonLabel = getButtonLabel(workspace);
  const buttonColor = getButtonColor(workspace);

  const handleClick = isProvisioned ? handleUnprovision : handleProvision;

  return (
    <TitleSection
      label={t`Status`}
      description={t`Provision the workspace to make it available for transforms.`}
    >
      <Group px="xl" py="md" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Icon name={iconName} c={iconColor} />
          <Text>{message}</Text>
        </Group>
        <Button
          variant="filled"
          color={buttonColor}
          disabled={isInProgress}
          onClick={handleClick}
        >
          {buttonLabel}
        </Button>
      </Group>
      {modalContent}
    </TitleSection>
  );
}

type StatusIconProps = {
  name: IconName;
  color: ColorName;
};

function getStatusIcon(workspace: Workspace): StatusIconProps {
  if (isWorkspaceProvisioning(workspace)) {
    return { name: "hourglass", color: "text-secondary" };
  }
  if (isWorkspaceUnprovisioning(workspace)) {
    return { name: "hourglass", color: "text-secondary" };
  }
  if (isWorkspaceProvisioned(workspace)) {
    return { name: "check_filled", color: "success" };
  }
  return { name: "warning", color: "warning" };
}

function getStatusMessage(workspace: Workspace): string {
  if (isWorkspaceProvisioning(workspace)) {
    return t`Provisioning this workspace…`;
  }
  if (isWorkspaceUnprovisioning(workspace)) {
    return t`Unprovisioning this workspace…`;
  }
  if (isWorkspaceProvisioned(workspace)) {
    return t`This workspace is provisioned and ready to use.`;
  }
  return t`This workspace has not been provisioned yet.`;
}

function getButtonLabel(workspace: Workspace): string {
  if (isWorkspaceProvisioning(workspace)) {
    return t`Provisioning…`;
  }
  if (isWorkspaceUnprovisioning(workspace)) {
    return t`Unprovisioning…`;
  }
  if (isWorkspaceProvisioned(workspace)) {
    return t`Unprovision workspace`;
  }
  return t`Provision workspace`;
}

function getButtonColor(workspace: Workspace): ColorName {
  if (isWorkspaceUnprovisioning(workspace)) {
    return "error";
  }
  if (isWorkspaceProvisioned(workspace)) {
    return "error";
  }
  return "brand";
}
