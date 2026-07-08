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
import { getUserName } from "metabase/utils/user";
import type { Workspace, WorkspaceDatabase } from "metabase-types/api";

import { trackWorkspaceConfigDownloaded } from "../../../analytics";
import { DeleteWorkspaceModal } from "../DeleteWorkspaceModal";
import { PushConfigModal } from "../PushConfigModal";
import { RenameWorkspaceModal } from "../RenameWorkspaceModal";

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
        <Stack gap="sm">
          <Box fw="bold" fz="1rem" lh="1rem">
            {workspace.name}
          </Box>
          <WorkspaceCreatorInfo workspace={workspace} />
          <WorkspaceInstanceInfo workspace={workspace} />
          {workspace.databases?.map((workspaceDatabase) => (
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

type WorkspaceCreatorInfoProps = {
  workspace: Workspace;
};

function WorkspaceCreatorInfo({ workspace }: WorkspaceCreatorInfoProps) {
  const { creator } = workspace;
  const timeAgo = getRelativeTime(workspace.created_at);

  return (
    <Box c="text-secondary" lh="1rem">
      {creator != null
        ? t`Created by ${getUserName(creator)} ${timeAgo}`
        : t`Created ${timeAgo}`}
    </Box>
  );
}

type WorkspaceInstanceInfoProps = {
  workspace: Workspace;
};

function WorkspaceInstanceInfo({ workspace }: WorkspaceInstanceInfoProps) {
  const { instance } = workspace;

  if (instance == null) {
    return null;
  }

  return (
    <Box c="text-secondary" lh="1rem">
      <Group gap="xs" wrap="nowrap">
        <FixedSizeIcon name="cloud" aria-hidden />
        {instance.initialized_at != null
          ? t`Developed on ${instance.name}`
          : t`Assigned to ${instance.name} (not set up yet)`}
      </Group>
    </Box>
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
    <Box c="text-secondary" lh="1rem">
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
  const [isRenameOpen, { open: openRename, close: closeRename }] =
    useDisclosure(false);
  const [isDeleteOpen, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);
  const [isPushOpen, { open: openPush, close: closePush }] =
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
          {workspace.instance != null && (
            <Menu.Item
              leftSection={<FixedSizeIcon name="cloud" aria-hidden />}
              onClick={openPush}
            >
              {t`Set up the instance`}
            </Menu.Item>
          )}
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
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <RenameWorkspaceModal
        workspace={workspace}
        opened={isRenameOpen}
        onRename={closeRename}
        onClose={closeRename}
      />
      <DeleteWorkspaceModal
        workspace={workspace}
        opened={isDeleteOpen}
        onDelete={closeDelete}
        onClose={closeDelete}
      />
      <PushConfigModal
        workspace={workspace}
        opened={isPushOpen}
        onClose={closePush}
      />
    </>
  );
}
