import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
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
import { getRelativeTime } from "metabase/utils/time-dayjs";
import { getUserName } from "metabase/utils/user";
import {
  useDeleteWorkspaceMutation,
  useDeprovisionWorkspaceMutation,
  useProvisionWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Workspace, WorkspaceDatabase } from "metabase-types/api";

import {
  getWorkspaceDatabaseName,
  isDeprovisioned,
  isDeprovisioning,
  isProvisioned,
  isProvisioning,
} from "../../../utils";
import { RenameWorkspaceModal } from "../RenameWorkspaceModal";

import { getStatusMessage } from "./utils";

export type WorkspaceItemProps = {
  workspace: Workspace;
};

export function WorkspaceItem({ workspace }: WorkspaceItemProps) {
  const databases = workspace.databases ?? [];

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
          <WorkspaceStatusItem workspace={workspace} />
          {workspace.instance_url != null && (
            <WorkspaceInstanceItem instanceUrl={workspace.instance_url} />
          )}
          {databases.map((workspaceDatabase) => (
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

type WorkspaceStatusItemProps = {
  workspace: Workspace;
};

function WorkspaceStatusItem({ workspace }: WorkspaceStatusItemProps) {
  return (
    <Box c="text-primary" lh="1rem">
      {getStatusMessage(workspace.status)}
    </Box>
  );
}

type WorkspaceInstanceItemProps = {
  instanceUrl: string;
};

function WorkspaceInstanceItem({ instanceUrl }: WorkspaceInstanceItemProps) {
  return (
    <Box c="text-secondary" lh="1rem">
      <Group gap="xs" wrap="nowrap">
        <FixedSizeIcon name="workspace" aria-hidden />
        <Anchor
          href={instanceUrl}
          target="_blank"
          rel="noopener noreferrer"
          lh="inherit"
        >
          {instanceUrl}
        </Anchor>
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
  return (
    <Box c="text-secondary" lh="1rem">
      <Group gap="xs" wrap="nowrap">
        <FixedSizeIcon name="database" aria-hidden />
        {getWorkspaceDatabaseName(workspaceDatabase)}
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
  const [provisionWorkspace] = useProvisionWorkspaceMutation();
  const [deprovisionWorkspace] = useDeprovisionWorkspaceMutation();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();
  const { modalContent, show: showConfirmation } = useConfirmation();

  const handleProvision = () => {
    showConfirmation({
      title: t`Provision this workspace?`,
      message: t`This will set up temporary database users and schemas and a workspace instance.`,
      confirmButtonText: t`Provision`,
      onConfirm: () => provisionWorkspace(workspace.id),
    });
  };

  const handleDeprovision = () => {
    showConfirmation({
      title: t`Deprovision this workspace?`,
      message: t`This will delete the workspace instance and the temporary database users and schemas that were created for this workspace.`,
      confirmButtonText: t`Deprovision`,
      onConfirm: () => deprovisionWorkspace(workspace.id),
    });
  };

  const handleDelete = () => {
    showConfirmation({
      title: t`Delete this workspace?`,
      message: t`This will delete the workspace. This can't be undone.`,
      confirmButtonText: t`Delete workspace`,
      onConfirm: () => deleteWorkspace(workspace.id),
    });
  };

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon aria-label={t`Workspace actions`}>
            <FixedSizeIcon name="ellipsis" aria-hidden />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {!isProvisioned(workspace) && !isDeprovisioning(workspace) && (
            <Menu.Item
              leftSection={<FixedSizeIcon name="play" aria-hidden />}
              disabled={isProvisioning(workspace)}
              onClick={handleProvision}
            >
              {t`Provision`}
            </Menu.Item>
          )}
          {!isDeprovisioned(workspace) && !isProvisioning(workspace) && (
            <Menu.Item
              leftSection={<FixedSizeIcon name="revert" aria-hidden />}
              disabled={isDeprovisioning(workspace)}
              onClick={handleDeprovision}
            >
              {t`Deprovision`}
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
            disabled={!isDeprovisioned(workspace)}
            onClick={handleDelete}
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
      {modalContent}
    </>
  );
}
