import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { hasFeature } from "metabase/common/utils/database";
import { ActionIcon, Card, FixedSizeIcon, Group, Menu } from "metabase/ui";
import type {
  Database,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

import { DatabaseInfo } from "../../../../components/DatabaseInfo";
import { useDeleteDatabase } from "../../../../hooks";
import { UpdateDatabaseModal } from "../UpdateDatabaseModal";

export type DatabaseItemProps = {
  workspace: Workspace;
  workspaceDatabase: WorkspaceDatabase;
  database: Database | undefined;
};

export function DatabaseItem({
  workspace,
  workspaceDatabase,
  database,
}: DatabaseItemProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const { handleDelete, modalContent } = useDeleteDatabase({ database });
  const supportsSchemas = database != null && hasFeature(database, "schemas");

  return (
    <Card
      role="region"
      aria-label={database?.name}
      data-testid="workspace-database-item"
      p="lg"
      shadow="none"
      withBorder
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <DatabaseInfo
          workspaceDatabase={workspaceDatabase}
          database={database}
        />
        <Menu>
          <Menu.Target>
            <ActionIcon size="sm" aria-label={t`Database actions`}>
              <FixedSizeIcon name="ellipsis" aria-hidden />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {supportsSchemas && (
              <Menu.Item
                leftSection={<FixedSizeIcon name="pencil" aria-hidden />}
                onClick={open}
              >{t`Edit`}</Menu.Item>
            )}
            <Menu.Item
              leftSection={<FixedSizeIcon name="trash" aria-hidden />}
              onClick={() => handleDelete(workspace, workspaceDatabase)}
            >{t`Remove`}</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      {database != null && (
        <UpdateDatabaseModal
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
