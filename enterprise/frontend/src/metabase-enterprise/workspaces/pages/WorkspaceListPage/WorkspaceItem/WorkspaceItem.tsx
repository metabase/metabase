import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import {
  ActionIcon,
  Badge,
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Menu,
  Text,
  Title,
} from "metabase/ui";
import type { Workspace } from "metabase-types/api/workspace";

import { DeleteWorkspaceModal } from "../DeleteWorkspaceModal";

type WorkspaceItemProps = {
  workspace: Workspace;
};

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  return (
    <Card>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <WorkspaceItemDetails workspace={workspace} />
        <WorkspaceItemMenu workspace={workspace} />
      </Group>
    </Card>
  );
}

type WorkspaceItemDetailsProps = {
  workspace: Workspace;
};

function WorkspaceItemDetails({ workspace }: WorkspaceItemDetailsProps) {
  const databases = workspace.databases
    .map((database) => database.database)
    .filter((database) => database != null);
  const instance = workspace.instance;

  return (
    <Box>
      <Title order={3}>{workspace.name}</Title>
      {databases.length > 0 && (
        <Text c="text-secondary">
          {databases.map((database) => database.name).join(", ")}
        </Text>
      )}
      {instance && (
        <Badge component={Link} to={instance.url} mt="md">
          {instance.name}
        </Badge>
      )}
    </Box>
  );
}

type WorkspaceItemMenuProps = {
  workspace: Workspace;
};

function WorkspaceItemMenu({ workspace }: WorkspaceItemMenuProps) {
  const [deleteOpened, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);

  return (
    <>
      <Menu>
        <Menu.Target>
          <ActionIcon size="sm" aria-label={t`Workspace actions`}>
            <FixedSizeIcon name="ellipsis" aria-hidden />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
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
        opened={deleteOpened}
        onDelete={closeDelete}
        onClose={closeDelete}
      />
    </>
  );
}
