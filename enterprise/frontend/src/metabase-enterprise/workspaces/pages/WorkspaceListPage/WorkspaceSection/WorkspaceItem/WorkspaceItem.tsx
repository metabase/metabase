import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import {
  ActionIcon,
  Anchor,
  Box,
  Card,
  Group,
  Icon,
  Menu,
  Stack,
  Title,
} from "metabase/ui";
import type { Workspace } from "metabase-types/api";

import { DeleteWorkspaceModal } from "../DeleteWorkspaceModal";

type WorkspaceItemProps = {
  workspace: Workspace;
};

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  const databases = workspace.databases
    .map((database) => database.database)
    .filter((database) => database != null);

  return (
    <Card shadow="none" withBorder>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap="sm">
          <Title order={3}>{workspace.name}</Title>
          {databases.length > 0 && (
            <Box c="text-secondary">
              {databases.map((database) => database.name).join(", ")}
            </Box>
          )}
          {workspace.instance != null && (
            <Anchor
              href={workspace.instance.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {workspace.instance.url}
            </Anchor>
          )}
        </Stack>
        <WorkspaceItemMenu workspace={workspace} />
      </Group>
    </Card>
  );
}

type WorkspaceItemMenuProps = {
  workspace: Workspace;
};

function WorkspaceItemMenu({ workspace }: WorkspaceItemMenuProps) {
  const [
    deleteModalOpened,
    { open: openDeleteModal, close: closeDeleteModal },
  ] = useDisclosure(false);

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {workspace.instance != null && (
            <Menu.Item
              component={Link}
              to={workspace.instance.url}
              target="_blank"
              rel="noopener noreferrer"
              leftSection={<Icon name="external" />}
            >
              {t`Open`}
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={<Icon name="trash" />}
            onClick={openDeleteModal}
          >
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <DeleteWorkspaceModal
        workspace={workspace}
        opened={deleteModalOpened}
        onDelete={closeDeleteModal}
        onClose={closeDeleteModal}
      />
    </>
  );
}
