import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, Card, Group, Icon } from "metabase/ui";
import type {
  Database,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

import { WorkspaceDatabaseInfo } from "../../../../components/WorkspaceDatabaseInfo";
import { useDeleteWorkspaceDatabase } from "../../../../hooks";
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
  const { handleDelete, modalContent } = useDeleteWorkspaceDatabase({
    availableDatabases,
  });

  return (
    <Card p="lg" shadow="none" withBorder>
      <Group justify="space-between" align="center" wrap="nowrap">
        <WorkspaceDatabaseInfo
          workspaceDatabase={workspaceDatabase}
          availableDatabases={availableDatabases}
        />
        <Group gap="sm" wrap="nowrap">
          <Button
            aria-label={t`Edit database`}
            leftSection={<Icon name="pencil" />}
            onClick={open}
          />
          <Button
            aria-label={t`Remove database`}
            leftSection={<Icon name="trash" />}
            onClick={() => handleDelete(workspace, workspaceDatabase)}
          />
        </Group>
      </Group>
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
