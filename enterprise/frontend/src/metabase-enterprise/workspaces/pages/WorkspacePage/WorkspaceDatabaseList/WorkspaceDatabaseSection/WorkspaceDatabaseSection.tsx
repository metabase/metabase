import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { hasFeature } from "metabase/common/utils/database";
import { ActionIcon, Card, Group, Icon, Menu } from "metabase/ui";
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
  database: Database | undefined;
};

export function WorkspaceDatabaseSection({
  workspace,
  workspaceDatabase,
  database,
}: WorkspaceDatabaseSectionProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const { handleDelete, modalContent } = useDeleteWorkspaceDatabase({
    database,
  });
  const supportsSchemas = database != null && hasFeature(database, "schemas");

  return (
    <Card p="lg" shadow="none" withBorder>
      <Group justify="space-between" align="center" wrap="nowrap">
        <WorkspaceDatabaseInfo
          workspaceDatabase={workspaceDatabase}
          database={database}
        />
        <Menu>
          <Menu.Target>
            <ActionIcon size="sm" aria-label={t`Database actions`}>
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {supportsSchemas && (
              <Menu.Item
                leftSection={<Icon name="pencil" />}
                onClick={open}
              >{t`Edit`}</Menu.Item>
            )}
            <Menu.Item
              leftSection={<Icon name="trash" />}
              onClick={() => handleDelete(workspace, workspaceDatabase)}
            >{t`Remove`}</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      {database != null && (
        <UpdateWorkspaceDatabaseModal
          workspace={workspace}
          workspaceDatabase={workspaceDatabase}
          database={database}
          opened={opened}
          onUpdate={close}
          onClose={close}
        />
      )}
      {modalContent}
    </Card>
  );
}
