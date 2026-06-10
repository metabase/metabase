import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import {
  ActionIcon,
  Anchor,
  Card,
  Group,
  Icon,
  Menu,
  Stack,
  Title,
} from "metabase/ui";
import type { WorkspaceInstance } from "metabase-types/api";

import { DeleteInstanceModal } from "../DeleteInstanceModal";
import { EditInstanceModal } from "../EditInstanceModal";

type InstanceItemProps = {
  instance: WorkspaceInstance;
};

export function InstanceItem({ instance }: InstanceItemProps) {
  return (
    <Card shadow="none" withBorder>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap="sm">
          <Title order={3}>{instance.name}</Title>
          <Anchor href={instance.url} target="_blank" rel="noopener noreferrer">
            {instance.url}
          </Anchor>
        </Stack>
        <InstanceItemMenu instance={instance} />
      </Group>
    </Card>
  );
}

type InstanceItemMenuProps = {
  instance: WorkspaceInstance;
};

function InstanceItemMenu({ instance }: InstanceItemMenuProps) {
  const [
    renameModalOpened,
    { open: openRenameModal, close: closeRenameModal },
  ] = useDisclosure(false);
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
          <Menu.Item
            component={Link}
            to={instance.url}
            target="_blank"
            rel="noopener noreferrer"
            leftSection={<Icon name="external" />}
          >
            {t`Open`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="pencil" />}
            onClick={openRenameModal}
          >
            {t`Rename`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="trash" />}
            disabled={instance.workspace_id != null}
            onClick={openDeleteModal}
          >
            {t`Remove`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <EditInstanceModal
        instance={instance}
        opened={renameModalOpened}
        onSave={closeRenameModal}
        onClose={closeRenameModal}
      />
      <DeleteInstanceModal
        instance={instance}
        opened={deleteModalOpened}
        onDelete={closeDeleteModal}
        onClose={closeDeleteModal}
      />
    </>
  );
}
