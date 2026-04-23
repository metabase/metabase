import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Text } from "metabase/ui";
import {
  useProvisionWorkspaceMutation,
  useUnprovisionWorkspaceMutation,
} from "metabase-enterprise/api";
import type { WorkspaceId } from "metabase-types/api";

import type { WorkspaceInfo } from "../../../types";
import {
  isDatabaseProvisioned,
  isDatabaseProvisioning,
  isDatabaseUnprovisioning,
} from "../../../utils";
import { TitleSection } from "../../TitleSection";

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
      description={t`Provision to enable transforms in this workspace.`}
    >
      <Group p="md" justify="space-between" wrap="nowrap">
        <WorkspaceStatus workspace={workspace} />
        {isProvisioned ? (
          <UnprovisionButton workspace={workspace} workspaceId={workspaceId} />
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
    workspace.databases.some(isDatabaseUnprovisioning);

  const handleProvision = () => {
    show({
      title: t`Provision this workspace?`,
      message: t`Creates an isolation schema and a database user in each database. The user can read the readable schemas and write to the isolation schema.`,
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

function UnprovisionButton({ workspace, workspaceId }: StatusButtonProps) {
  const [unprovisionWorkspace] = useUnprovisionWorkspaceMutation();
  const { modalContent, show } = useConfirmation();
  const { sendErrorToast } = useMetadataToasts();

  const isInProgress =
    workspace.databases.some(isDatabaseProvisioning) ||
    workspace.databases.some(isDatabaseUnprovisioning);

  const handleUnprovision = () => {
    show({
      title: t`Unprovision this workspace?`,
      message: t`Deletes the isolation schema and database user from each database.`,
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
    <>
      <Button
        variant="default"
        disabled={isInProgress}
        onClick={handleUnprovision}
      >
        {getButtonLabel(workspace)}
      </Button>
      {modalContent}
    </>
  );
}
