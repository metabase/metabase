import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import {
  ActionIcon,
  Anchor,
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Menu,
  Stack,
} from "metabase/ui";
import type { WorkspaceInstance } from "metabase-types/api";

import { DeleteInstanceModal } from "../DeleteInstanceModal";
import { EditInstanceModal } from "../EditInstanceModal";

export type InstanceItemProps = {
  instance: WorkspaceInstance;
};

export function InstanceItem({ instance }: InstanceItemProps) {
  return (
    <Card
      role="region"
      aria-label={instance.name}
      data-testid="instance-item"
      p="lg"
      shadow="none"
      withBorder
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap="sm">
          <Box fw="bold" fz="1rem" lh="1rem">
            {instance.name}
          </Box>
          <Anchor
            component={Link}
            to={instance.url}
            target="_blank"
            rel="noopener noreferrer"
            c="text-primary"
            lh="1rem"
          >
            {instance.url}
          </Anchor>
        </Stack>
        <InstanceMenu instance={instance} />
      </Group>
    </Card>
  );
}

type InstanceMenuProps = {
  instance: WorkspaceInstance;
};

function InstanceMenu({ instance }: InstanceMenuProps) {
  const [isRenameOpen, { open: openRename, close: closeRename }] =
    useDisclosure(false);
  const [isDeleteOpen, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon aria-label={t`Instance options`}>
            <FixedSizeIcon name="ellipsis" aria-hidden />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<FixedSizeIcon name="pencil" aria-hidden />}
            onClick={openRename}
          >
            {t`Rename`}
          </Menu.Item>
          <Menu.Item
            leftSection={<FixedSizeIcon name="trash" aria-hidden />}
            onClick={openDelete}
          >
            {t`Remove`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <EditInstanceModal
        instance={instance}
        opened={isRenameOpen}
        onSave={closeRename}
        onClose={closeRename}
      />
      <DeleteInstanceModal
        instance={instance}
        opened={isDeleteOpen}
        onDelete={closeDelete}
        onClose={closeDelete}
      />
    </>
  );
}
