import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Card, Group, Icon, Pill, Stack, Text } from "metabase/ui";
import { useDeleteWorkspaceDatabaseMutation } from "metabase-enterprise/api";
import type {
  Database,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

import { UpdateWorkspaceDatabaseModal } from "../UpdateWorkspaceDatabaseModal";

export type WorkspaceDatabaseSectionProps = {
  workspace: Workspace;
  workspaceDatabase: WorkspaceDatabase;
  availableDatabases: Database[];
};

export function WorkspaceDatabaseSection({
  workspace,
  workspaceDatabase,
  availableDatabases,
}: WorkspaceDatabaseSectionProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const { modalContent, show } = useConfirmation();
  const [deleteWorkspaceDatabase] = useDeleteWorkspaceDatabaseMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const database = availableDatabases.find(
    (candidate) => candidate.id === workspaceDatabase.database_id,
  );
  const databaseLabel =
    database?.name ?? t`Database ${workspaceDatabase.database_id}`;

  const handleDelete = () => {
    show({
      title: t`Remove ${databaseLabel}?`,
      message: t`This will deprovision the database from the workspace.`,
      confirmButtonText: t`Remove`,
      confirmButtonProps: { color: "danger" },
      onConfirm: async () => {
        const { error } = await deleteWorkspaceDatabase({
          id: workspace.id,
          database_id: workspaceDatabase.database_id,
        });
        if (error) {
          sendErrorToast(t`Failed to remove database`);
        } else {
          sendSuccessToast(t`Database removed`);
        }
      },
    });
  };

  return (
    <Card p="lg" shadow="none" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap="sm">
            <Text fw="bold">{databaseLabel}</Text>
            {workspaceDatabase.input_schemas.length > 0 && (
              <Group gap="sm" wrap="wrap">
                {workspaceDatabase.input_schemas.map((schema) => (
                  <Pill key={schema}>{schema}</Pill>
                ))}
              </Group>
            )}
          </Stack>
          <Group gap="sm" wrap="nowrap">
            <Button
              aria-label={t`Edit database`}
              leftSection={<Icon name="pencil" />}
              onClick={open}
            />
            <Button
              aria-label={t`Remove database`}
              leftSection={<Icon name="trash" />}
              onClick={handleDelete}
            />
          </Group>
        </Group>
      </Stack>
      <UpdateWorkspaceDatabaseModal
        workspace={workspace}
        workspaceDatabase={workspaceDatabase}
        availableDatabases={availableDatabases}
        opened={opened}
        onUpdate={close}
        onClose={close}
      />
      {modalContent}
    </Card>
  );
}
