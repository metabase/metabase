import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Text } from "metabase/ui";
import {
  useDeprovisionWorkspaceMutation,
  useProvisionWorkspaceMutation,
} from "metabase-enterprise/api";
import type { WorkspaceId } from "metabase-types/api";

import type { WorkspaceInfo } from "../../../types";
import {
  isDatabaseDeprovisioning,
  isDatabaseProvisioned,
  isDatabaseProvisioning,
} from "../../../utils";
import { TitleSection } from "../TitleSection";

import { getButtonLabel, getStatusIcon, getStatusMessage } from "./utils";

type StatusSectionProps = {
  workspace: WorkspaceInfo;
};

export function StatusSection({ workspace }: StatusSectionProps) {
  const workspaceId = workspace.id;
  if (workspaceId == null) {
    return null;
  }

  const isProvisioned = workspace.databases.every(isDatabaseProvisioned);

  return (
    <TitleSection
      label={t`Status`}
      description={t`Provisioning creates a temporary schema in each database and a user with read-only database access and write access to the schema.`}
    >
      <Group p="md" justify="space-between" wrap="nowrap">
        <WorkspaceStatus workspace={workspace} />
        {isProvisioned ? (
          <DeprovisionButton workspace={workspace} workspaceId={workspaceId} />
        ) : (
          <ProvisionButton workspace={workspace} workspaceId={workspaceId} />
        )}
      </Group>
    </TitleSection>
  );
}

function WorkspaceStatus({ workspace }: { workspace: WorkspaceInfo }) {
  return (
    <Group gap="sm" wrap="nowrap">
      {getStatusIcon(workspace)}
      <Text>{getStatusMessage(workspace)}</Text>
    </Group>
  );
}

type StatusButtonProps = {
  workspace: WorkspaceInfo;
  workspaceId: WorkspaceId;
};

function ProvisionButton({ workspace, workspaceId }: StatusButtonProps) {
  const [provisionWorkspace] = useProvisionWorkspaceMutation();
  const { modalContent, show } = useConfirmation();
  const { sendErrorToast } = useMetadataToasts();

  const isInProgress =
    workspace.databases.some(isDatabaseProvisioning) ||
    workspace.databases.some(isDatabaseDeprovisioning);

  const handleProvision = () => {
    show({
      title: t`Provision this workspace?`,
      message: t`Creates an isolation schema and a database user in each database.`,
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

  return (
    <>
      <Button
        variant="filled"
        disabled={isInProgress}
        onClick={handleProvision}
      >
        {getButtonLabel(workspace)}
      </Button>
      {modalContent}
    </>
  );
}

function DeprovisionButton({ workspace, workspaceId }: StatusButtonProps) {
  const [deprovisionWorkspace] = useDeprovisionWorkspaceMutation();
  const { modalContent, show } = useConfirmation();
  const { sendErrorToast } = useMetadataToasts();

  const isInProgress =
    workspace.databases.some(isDatabaseProvisioning) ||
    workspace.databases.some(isDatabaseDeprovisioning);

  const handleDeprovision = () => {
    show({
      title: t`Deprovision this workspace?`,
      message: t`Deletes the isolation schema and database user from each database.`,
      confirmButtonText: t`Deprovision workspace`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        const { error } = await deprovisionWorkspace(workspaceId);
        if (error) {
          sendErrorToast(t`Failed to deprovision workspace`);
        }
      },
    });
  };

  return (
    <>
      <Button
        variant="default"
        disabled={isInProgress}
        onClick={handleDeprovision}
      >
        {getButtonLabel(workspace)}
      </Button>
      {modalContent}
    </>
  );
}
