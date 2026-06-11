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
  Tooltip,
} from "metabase/ui";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import { getUserName } from "metabase/utils/user";
import type {
  Workspace,
  WorkspaceDatabase,
  WorkspaceInstance,
} from "metabase-types/api";

import { trackWorkspaceConfigDownloaded } from "../../../analytics";
import { DeleteWorkspaceModal } from "../DeleteWorkspaceModal";
import { ProvisionWorkspaceModal } from "../ProvisionWorkspaceModal";
import { RenameWorkspaceModal } from "../RenameWorkspaceModal";
import { UnprovisionWorkspaceModal } from "../UnprovisionWorkspaceModal";

const CONFIG_FILENAME = "config.yml";

export type WorkspaceItemProps = {
  workspace: Workspace;
  instance?: WorkspaceInstance;
  instances: WorkspaceInstance[];
};

export function WorkspaceItem({
  workspace,
  instance,
  instances,
}: WorkspaceItemProps) {
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
          {workspace.databases?.map((workspaceDatabase) => (
            <WorkspaceDatabaseItem
              key={workspaceDatabase.database_id}
              workspaceDatabase={workspaceDatabase}
            />
          ))}
          <WorkspaceInstanceInfo instance={instance} />
        </Stack>
        <WorkspaceMenu
          workspace={workspace}
          instance={instance}
          instances={instances}
        />
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

type WorkspaceInstanceInfoProps = {
  instance?: WorkspaceInstance;
};

function WorkspaceInstanceInfo({ instance }: WorkspaceInstanceInfoProps) {
  return (
    <Box c="text-secondary" lh="1rem">
      <Group gap="xs" wrap="nowrap">
        <FixedSizeIcon name="workspace" aria-hidden />
        {instance != null ? (
          <Anchor
            component={Link}
            to={instance.url}
            target="_blank"
            rel="noopener noreferrer"
            c="text-primary"
            lh="1rem"
          >
            {instance.name}
          </Anchor>
        ) : (
          t`Not provisioned`
        )}
      </Group>
    </Box>
  );
}

type WorkspaceMenuProps = {
  workspace: Workspace;
  instance?: WorkspaceInstance;
  instances: WorkspaceInstance[];
};

function WorkspaceMenu({ workspace, instance, instances }: WorkspaceMenuProps) {
  const [isProvisionOpen, { open: openProvision, close: closeProvision }] =
    useDisclosure(false);
  const [
    isUnprovisionOpen,
    { open: openUnprovision, close: closeUnprovision },
  ] = useDisclosure(false);
  const [isRenameOpen, { open: openRename, close: closeRename }] =
    useDisclosure(false);
  const [isDeleteOpen, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);

  const isProvisioned = instance != null;
  const hasFreeInstance = instances.some(
    (workspaceInstance) => workspaceInstance.workspace_id == null,
  );

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon aria-label={t`Workspace options`}>
            <FixedSizeIcon name="ellipsis" aria-hidden />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {!isProvisioned && (
            <Tooltip
              label={t`You need a free developer instance to provision this workspace.`}
              disabled={hasFreeInstance}
            >
              <Menu.Item
                leftSection={<FixedSizeIcon name="workspace" aria-hidden />}
                disabled={!hasFreeInstance}
                onClick={openProvision}
              >
                {t`Provision`}
              </Menu.Item>
            </Tooltip>
          )}
          {isProvisioned && (
            <Menu.Item
              leftSection={<FixedSizeIcon name="workspace" aria-hidden />}
              onClick={openUnprovision}
            >
              {t`Unprovision`}
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={<FixedSizeIcon name="pencil" aria-hidden />}
            onClick={openRename}
          >
            {t`Rename`}
          </Menu.Item>
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
      <ProvisionWorkspaceModal
        workspace={workspace}
        instances={instances}
        opened={isProvisionOpen}
        onProvision={closeProvision}
        onClose={closeProvision}
      />
      {instance != null && (
        <UnprovisionWorkspaceModal
          workspace={workspace}
          instance={instance}
          opened={isUnprovisionOpen}
          onUnprovision={closeUnprovision}
          onClose={closeUnprovision}
        />
      )}
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
    </>
  );
}
