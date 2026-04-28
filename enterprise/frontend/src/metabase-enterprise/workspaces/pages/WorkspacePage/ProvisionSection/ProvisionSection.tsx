import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group } from "metabase/ui";
import {
  useProvisionWorkspaceMutation,
  useUnprovisionWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import {
  isDatabaseProvisioned,
  isDatabaseProvisioning,
  isDatabaseUnprovisioned,
  isDatabaseUnprovisioning,
} from "../../../utils";
import { TitleSection } from "../TitleSection";

type ProvisionSectionProps = {
  workspace: Workspace;
};

export function ProvisionSection({ workspace }: ProvisionSectionProps) {
  const hasProvisioned = workspace.databases.some(isDatabaseProvisioned);
  const hasUnprovisioned = workspace.databases.some(isDatabaseUnprovisioned);
  const hasProvisioning = workspace.databases.some(isDatabaseProvisioning);
  const hasUnprovisioning = workspace.databases.some(isDatabaseUnprovisioning);

  return (
    <TitleSection
      label={t`Provision the workspace`}
      description={t`Create a temporary schema in each database and a user with read-only database access and write access to the schema.`}
    >
      <Group p="md" gap="sm" wrap="nowrap">
        {(hasUnprovisioned || hasProvisioning) && (
          <ProvisionButton workspace={workspace} />
        )}
        {(hasProvisioned || hasUnprovisioning) && (
          <UnprovisionButton workspace={workspace} />
        )}
      </Group>
    </TitleSection>
  );
}

function ProvisionButton({ workspace }: { workspace: Workspace }) {
  const [provisionWorkspace] = useProvisionWorkspaceMutation();
  const { modalContent, show } = useConfirmation();
  const { sendErrorToast } = useMetadataToasts();

  const isInProgress =
    workspace.databases.some(isDatabaseProvisioning) ||
    workspace.databases.some(isDatabaseUnprovisioning);
  const hasDatabases = workspace.databases.length > 0;

  const handleProvision = () => {
    show({
      title: t`Provision this workspace?`,
      message: t`Creates an isolation schema and a database user in each database.`,
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

  return (
    <>
      <Button
        variant="filled"
        disabled={isInProgress || !hasDatabases}
        onClick={handleProvision}
      >
        {workspace.databases.some(isDatabaseProvisioning)
          ? t`Provisioning…`
          : t`Provision workspace`}
      </Button>
      {modalContent}
    </>
  );
}

function UnprovisionButton({ workspace }: { workspace: Workspace }) {
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
        const { error } = await unprovisionWorkspace(workspace.id);
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
        {workspace.databases.some(isDatabaseUnprovisioning)
          ? t`Unprovisioning…`
          : t`Unprovision workspace`}
      </Button>
      {modalContent}
    </>
  );
}
