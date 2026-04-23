import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Text } from "metabase/ui";
import {
  useProvisionWorkspaceMutation,
  useUnprovisionWorkspaceMutation,
} from "metabase-enterprise/api";

import type { WorkspaceInfo } from "../../../types";
import {
  isDatabaseProvisioned,
  isDatabaseProvisioning,
  isDatabaseUnprovisioning,
} from "../../../utils";
import { TitleSection } from "../../TitleSection";

import { getButtonLabel, getStatusIcon, getStatusMessage } from "./utils";

type WorkspaceStatusSectionProps = {
  workspace: WorkspaceInfo;
};

export function WorkspaceStatusSection({
  workspace,
}: WorkspaceStatusSectionProps) {
  const workspaceId = workspace.id;
  const [provisionWorkspace] = useProvisionWorkspaceMutation();
  const [unprovisionWorkspace] = useUnprovisionWorkspaceMutation();
  const { modalContent, show } = useConfirmation();
  const { sendErrorToast } = useMetadataToasts();

  const isProvisioning = workspace.databases.some(isDatabaseProvisioning);
  const isUnprovisioning = workspace.databases.some(isDatabaseUnprovisioning);
  const isProvisioned = workspace.databases.every(isDatabaseProvisioned);
  const isInProgress = isProvisioning || isUnprovisioning;

  const handleProvision = () => {
    if (workspaceId == null) {
      return;
    }

    show({
      title: t`Provision this workspace?`,
      message: t`Provisioning creates a temporary schema in each database to run transforms in isolation, and creates a user with read-only access to the selected schemas and write access to the workspace schema.`,
      confirmButtonText: t`Provision workspace`,
      confirmButtonProps: { variant: "filled", color: "brand" },
      onConfirm: async () => {
        const { error } = await provisionWorkspace(workspaceId);
        if (error) {
          sendErrorToast(t`Failed to provision workspace`);
        }
      },
    });
  };

  const handleUnprovision = () => {
    if (workspaceId == null) {
      return;
    }

    show({
      title: t`Unprovision this workspace?`,
      message: t`Unprovisioning deletes the workspace user and the temporary schema from each database.`,
      confirmButtonText: t`Unprovision workspace`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        const { error } = await unprovisionWorkspace(workspaceId);
        if (error) {
          sendErrorToast(t`Failed to unprovision workspace`);
        }
      },
    });
  };

  return (
    <TitleSection
      label={t`Status`}
      description={t`Provision the workspace to make it available for transforms.`}
    >
      <Group p="md" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          {getStatusIcon(workspace)}
          <Text>{getStatusMessage(workspace)}</Text>
        </Group>
        <Button
          variant={isProvisioned ? "default" : "filled"}
          disabled={isInProgress}
          onClick={isProvisioned ? handleUnprovision : handleProvision}
        >
          {getButtonLabel(workspace)}
        </Button>
      </Group>
      {modalContent}
    </TitleSection>
  );
}
