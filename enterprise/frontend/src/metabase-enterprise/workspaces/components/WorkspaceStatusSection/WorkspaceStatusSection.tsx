import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Group, Icon, Text } from "metabase/ui";
import {
  useDeprovisionWorkspaceMutation,
  useProvisionWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

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
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const isInitialized = workspace.status === "initialized";

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
        } else {
          sendSuccessToast(t`Workspace provisioned`);
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
        } else {
          sendSuccessToast(t`Workspace deprovisioned`);
        }
      },
    });
  };

  return (
    <TitleSection
      label={t`Status`}
      description={t`Provision the workspace to make it available for transforms.`}
    >
      <Group px="xl" py="md" justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          {isInitialized ? (
            <Icon name="check_filled" c="success" />
          ) : (
            <Icon name="warning" c="warning" />
          )}
          <Text>
            {isInitialized
              ? t`This workspace is provisioned and ready to use.`
              : t`This workspace has not been provisioned yet.`}
          </Text>
        </Group>
        {isInitialized ? (
          <Button
            variant="filled"
            color="error"
            onClick={handleDeprovision}
          >{t`Deprovision workspace`}</Button>
        ) : (
          <Button
            variant="filled"
            onClick={handleProvision}
          >{t`Provision workspace`}</Button>
        )}
      </Group>
      {modalContent}
    </TitleSection>
  );
}
