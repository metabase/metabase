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
} from "metabase/ui";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type { WorkspaceInstance } from "metabase-types/api";

import { DeleteInstanceModal } from "../DeleteInstanceModal";
import { InstanceModal } from "../InstanceModal";

export type InstanceItemProps = {
  instance: WorkspaceInstance;
  workspaceName?: string;
};

export function InstanceItem({ instance, workspaceName }: InstanceItemProps) {
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
          <Box c="text-secondary" lh="1rem">
            <Group gap="xs" wrap="nowrap">
              <FixedSizeIcon name="link" aria-hidden />
              {instance.url}
            </Group>
          </Box>
          <InstanceStatusInfo
            instance={instance}
            workspaceName={workspaceName}
          />
        </Stack>
        <InstanceMenu instance={instance} />
      </Group>
    </Card>
  );
}

type InstanceStatusInfoProps = {
  instance: WorkspaceInstance;
  workspaceName?: string;
};

function InstanceStatusInfo({
  instance,
  workspaceName,
}: InstanceStatusInfoProps) {
  const assignment =
    instance.workspace_id != null
      ? workspaceName != null
        ? t`Used by the workspace "${workspaceName}"`
        : t`Used by a workspace`
      : t`Available for a workspace`;
  const initialized =
    instance.initialized_at != null
      ? t`set up ${getRelativeTime(instance.initialized_at)}`
      : t`not set up yet`;

  return (
    <Box c="text-secondary" lh="1rem">
      {assignment} · {initialized}
    </Box>
  );
}

type InstanceMenuProps = {
  instance: WorkspaceInstance;
};

function InstanceMenu({ instance }: InstanceMenuProps) {
  const [isEditOpen, { open: openEdit, close: closeEdit }] =
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
            onClick={openEdit}
          >
            {t`Edit`}
          </Menu.Item>
          <Menu.Item
            leftSection={<FixedSizeIcon name="trash" aria-hidden />}
            onClick={openDelete}
          >
            {t`Disconnect`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <InstanceModal
        instance={instance}
        opened={isEditOpen}
        onClose={closeEdit}
      />
      <DeleteInstanceModal
        instance={instance}
        opened={isDeleteOpen}
        onClose={closeDelete}
      />
    </>
  );
}
