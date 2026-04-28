import type { ReactNode } from "react";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Icon, Loader, Text } from "metabase/ui";
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

type StatusSectionProps = {
  workspace: Workspace;
};

export function StatusSection({ workspace }: StatusSectionProps) {
  const hasProvisioned = workspace.databases.some(isDatabaseProvisioned);
  const hasUnprovisioned = workspace.databases.some(isDatabaseUnprovisioned);

  return (
    <TitleSection
      label={t`Status`}
      description={t`Creates a temporary schema in each database and a user with read-only database access and write access to the schema.`}
    >
      <Group p="md" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <StatusIcon workspace={workspace} />
          <Text>{getStatusMessage(workspace)}</Text>
        </Group>
        <Group gap="sm" wrap="nowrap">
          {hasUnprovisioned && <ProvisionButton workspace={workspace} />}
          {hasProvisioned && <UnprovisionButton workspace={workspace} />}
        </Group>
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

function StatusIcon({ workspace }: { workspace: Workspace }): ReactNode {
  if (
    workspace.databases.some(isDatabaseProvisioning) ||
    workspace.databases.some(isDatabaseUnprovisioning)
  ) {
    return <Loader size="sm" />;
  }
  if (
    workspace.databases.length > 0 &&
    workspace.databases.every(isDatabaseProvisioned)
  ) {
    return <Icon name="check_filled" c="success" />;
  }
  return <Icon name="warning" c="warning" />;
}

function getStatusMessage(workspace: Workspace): string {
  if (workspace.databases.length === 0) {
    return t`Add a database to provision this workspace.`;
  }
  if (workspace.databases.some(isDatabaseProvisioning)) {
    return t`Provisioning this workspace…`;
  }
  if (workspace.databases.some(isDatabaseUnprovisioning)) {
    return t`Unprovisioning this workspace…`;
  }
  if (workspace.databases.every(isDatabaseProvisioned)) {
    return t`This workspace is provisioned and ready to use.`;
  }
  if (workspace.databases.every(isDatabaseUnprovisioned)) {
    return t`This workspace is not provisioned yet.`;
  }
  return t`This workspace is partially provisioned.`;
}
