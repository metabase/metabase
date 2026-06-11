import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Menu,
  Stack,
  Title,
} from "metabase/ui";
import type { Workspace, WorkspaceDatabase } from "metabase-types/api";

import { trackWorkspaceConfigDownloaded } from "../../../analytics";
import { DeleteWorkspaceModal } from "../DeleteWorkspaceModal";

const CONFIG_FILENAME = "config.yml";

export type WorkspaceItemProps = {
  workspace: Workspace;
};

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  return (
    <Card
      role="region"
      aria-label={workspace.name}
      data-testid="workspace-item"
      p="lg"
      shadow="none"
      withBorder
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack>
          <Title order={4}>{workspace.name}</Title>
          {workspace.databases.map((workspaceDatabase) => (
            <WorkspaceDatabaseItem
              key={workspaceDatabase.database_id}
              workspaceDatabase={workspaceDatabase}
            />
          ))}
        </Stack>
        <WorkspaceMenu workspace={workspace} />
      </Group>
    </Card>
  );
}

type WorkspaceDatabaseItemProps = {
  workspaceDatabase: WorkspaceDatabase;
};

function WorkspaceDatabaseItem({
  workspaceDatabase,
}: WorkspaceDatabaseItemProps) {
  const { database } = workspaceDatabase;

  if (database == null) {
    return null;
  }

  return (
    <Box c="text-secondary">
      <Group gap="xs" wrap="nowrap">
        <FixedSizeIcon name="database" aria-hidden />
        {database.name}
      </Group>
    </Box>
  );
}

type WorkspaceMenuProps = {
  workspace: Workspace;
};

function WorkspaceMenu({ workspace }: WorkspaceMenuProps) {
  const [isDeleteOpen, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon aria-label={t`Workspace options`}>
            <FixedSizeIcon name="ellipsis" aria-hidden />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            component="a"
            href={`/api/ee/workspace-manager/${workspace.id}/config`}
            download={CONFIG_FILENAME}
            leftSection={<FixedSizeIcon name="download" aria-hidden />}
            onClick={() =>
              trackWorkspaceConfigDownloaded({ workspaceId: workspace.id })
            }
          >
            {t`Download ${CONFIG_FILENAME}`}
          </Menu.Item>
          <Menu.Item
            leftSection={<FixedSizeIcon name="trash" aria-hidden />}
            onClick={openDelete}
          >
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <DeleteWorkspaceModal
        workspace={workspace}
        opened={isDeleteOpen}
        onDelete={closeDelete}
        onClose={closeDelete}
      />
    </>
  );
}
