import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  ActionIcon,
  Anchor,
  Card,
  FixedSizeIcon,
  Group,
  Menu,
  Stack,
  Title,
} from "metabase/ui";
import type { WorkspaceInstance } from "metabase-types/api";

import { DeleteInstanceModal } from "../DeleteInstanceModal";
import { EditInstanceModal } from "../EditInstanceModal";

export type InstanceItemProps = {
  instance: WorkspaceInstance;
};

export function InstanceItem({ instance }: InstanceItemProps) {
  const [editOpened, { open: openEdit, close: closeEdit }] =
    useDisclosure(false);
  const [deleteOpened, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);

  return (
    <Card
      role="region"
      aria-label={instance.name}
      data-testid="workspace-instance-item"
      p="lg"
      shadow="none"
      withBorder
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Stack gap="xs" miw={0}>
          <Title order={4}>{instance.name}</Title>
          <Anchor
            href={instance.url}
            target="_blank"
            rel="noreferrer"
            size="sm"
          >
            <Group gap="xs" align="center" wrap="nowrap">
              {instance.url}
              <FixedSizeIcon name="external" aria-hidden />
            </Group>
          </Anchor>
        </Stack>
        <Menu>
          <Menu.Target>
            <ActionIcon size="sm" aria-label={t`Instance actions`}>
              <FixedSizeIcon name="ellipsis" aria-hidden />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<FixedSizeIcon name="pencil" aria-hidden />}
              onClick={openEdit}
            >{t`Rename`}</Menu.Item>
            <Menu.Item
              leftSection={<FixedSizeIcon name="trash" aria-hidden />}
              onClick={openDelete}
            >{t`Delete`}</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <EditInstanceModal
        instance={instance}
        opened={editOpened}
        onSave={closeEdit}
        onClose={closeEdit}
      />
      <DeleteInstanceModal
        instance={instance}
        opened={deleteOpened}
        onDelete={closeDelete}
        onClose={closeDelete}
      />
    </Card>
  );
}
