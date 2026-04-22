import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Icon, type IconName, Text } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors";
import {
  useDeprovisionWorkspaceMutation,
  useProvisionWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import {
  isWorkspaceDeprovisioning,
  isWorkspaceProvisioned,
  isWorkspaceProvisioning,
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
  const [deprovisionWorkspace] = useDeprovisionWorkspaceMutation();
  const { sendErrorToast } = useMetadataToasts();

  const isProvisioning = isWorkspaceProvisioning(workspace);
  const isDeprovisioning = isWorkspaceDeprovisioning(workspace);
  const isProvisioned = isWorkspaceProvisioned(workspace);
  const isInProgress = isProvisioning || isDeprovisioning;

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

  const handleDeprovision = () => {
    show({
      title: t`Deprovision this workspace?`,
      message: t`Deprovisioning deletes the workspace user and the temporary schema from each database.`,
      confirmButtonText: t`Deprovision workspace`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        const { error } = await deprovisionWorkspace(workspace.id);
        if (error) {
          sendErrorToast(t`Failed to deprovision workspace`);
        }
      },
    });
  };

  const buttonLabel = getButtonLabel(workspace);
  const buttonColor = getButtonColor(workspace);

  const handleClick = isProvisioned ? handleDeprovision : handleProvision;

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
  if (isWorkspaceDeprovisioning(workspace)) {
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
  if (isWorkspaceDeprovisioning(workspace)) {
    return t`Deprovisioning this workspace…`;
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
  if (isWorkspaceDeprovisioning(workspace)) {
    return t`Deprovisioning…`;
  }
  if (isWorkspaceProvisioned(workspace)) {
    return t`Deprovision workspace`;
  }
  return t`Provision workspace`;
}

function getButtonColor(workspace: Workspace): ColorName {
  if (isWorkspaceDeprovisioning(workspace)) {
    return "error";
  }
  if (isWorkspaceProvisioned(workspace)) {
    return "error";
  }
  return "brand";
}
