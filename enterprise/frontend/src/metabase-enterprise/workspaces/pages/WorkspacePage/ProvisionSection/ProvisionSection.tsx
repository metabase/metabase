import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group } from "metabase/ui";
import {
  useProvisionWorkspaceMutation,
  useUnprovisionWorkspaceMutation,
} from "metabase-enterprise/api";
import type { WorkspaceDatabase, WorkspaceId } from "metabase-types/api";

import type { WorkspaceInfo } from "../../../types";
import {
  isDatabaseProvisioned,
  isDatabaseProvisioning,
  isDatabaseUnprovisioned,
  isDatabaseUnprovisioning,
} from "../../../utils";
import { TitleSection } from "../TitleSection";

type ProvisionSectionProps = {
  workspace: WorkspaceInfo;
};

export function ProvisionSection({ workspace }: ProvisionSectionProps) {
  const workspaceId = workspace.id;
  if (workspaceId == null) {
    return null;
  }

  const databases = workspace.databases;
  const hasProvisioned = databases.some(isDatabaseProvisioned);
  const hasUnprovisioned = databases.some(isDatabaseUnprovisioned);
  const hasProvisioning = databases.some(isDatabaseProvisioning);
  const hasUnprovisioning = databases.some(isDatabaseUnprovisioning);

  return (
    <TitleSection
      label={t`Provision the workspace`}
      description={t`Create a temporary schema in each database and a user with read-only database access and write access to the schema.`}
    >
      <Group p="md" gap="sm" wrap="nowrap">
        {(hasUnprovisioned || hasProvisioning) && (
          <ProvisionButton workspaceId={workspaceId} databases={databases} />
        )}
        {(hasProvisioned || hasUnprovisioning) && (
          <UnprovisionButton workspaceId={workspaceId} databases={databases} />
        )}
      </Group>
    </TitleSection>
  );
}

type ButtonProps = {
  workspaceId: WorkspaceId;
  databases: WorkspaceDatabase[];
};

function ProvisionButton({ workspaceId, databases }: ButtonProps) {
  const [provisionWorkspace] = useProvisionWorkspaceMutation();
  const { modalContent, show } = useConfirmation();
  const { sendErrorToast } = useMetadataToasts();

  const isInProgress =
    databases.some(isDatabaseProvisioning) ||
    databases.some(isDatabaseUnprovisioning);

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
        {databases.some(isDatabaseProvisioning)
          ? t`Provisioning…`
          : t`Provision workspace`}
      </Button>
      {modalContent}
    </>
  );
}

function UnprovisionButton({ workspaceId, databases }: ButtonProps) {
  const [unprovisionWorkspace] = useUnprovisionWorkspaceMutation();
  const { modalContent, show } = useConfirmation();
  const { sendErrorToast } = useMetadataToasts();

  const isInProgress =
    databases.some(isDatabaseProvisioning) ||
    databases.some(isDatabaseUnprovisioning);

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
        {databases.some(isDatabaseUnprovisioning)
          ? t`Unprovisioning…`
          : t`Unprovision workspace`}
      </Button>
      {modalContent}
    </>
  );
}
