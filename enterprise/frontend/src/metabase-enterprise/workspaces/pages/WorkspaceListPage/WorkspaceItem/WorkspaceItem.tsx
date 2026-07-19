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
  Loader,
  Menu,
  Stack,
  Tooltip,
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
  getDatabaseName,
  getStatusMessage,
  isDeprovisioned,
  isDeprovisioning,
  isProvisioned,
  isProvisioning,
} from "../../../utils";
import { RenameWorkspaceModal } from "../RenameWorkspaceModal";
import { StatusDetailsModal } from "../StatusDetailsModal";

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
          {isProvisioned(workspace) ? (
            <WorkspaceInstanceItem instanceUrl={workspace.instance_url} />
          ) : (
            <WorkspaceStatusItem workspace={workspace} />
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
  const showDetails = workspace.status_details != null;

  return (
    <Group gap="xs" wrap="nowrap">
      <WorkspaceStatusIcon workspace={workspace} />
      <Box c="text-primary" lh="1rem">
        {getStatusMessage(workspace.status)}
      </Box>
      {showDetails && <SeeDetailsButton workspace={workspace} />}
    </Group>
  );
}

function SeeDetailsButton({ workspace }: WorkspaceStatusItemProps) {
  const [isDetailsOpen, { open: openDetails, close: closeDetails }] =
    useDisclosure(false);

  return (
    <>
      <Tooltip label={t`See details`}>
        <ActionIcon size="xs" aria-label={t`See details`} onClick={openDetails}>
          <FixedSizeIcon name="info" aria-hidden />
        </ActionIcon>
      </Tooltip>
      <StatusDetailsModal
        workspace={workspace}
        opened={isDetailsOpen}
        onClose={closeDetails}
      />
    </>
  );
}

function WorkspaceStatusIcon({ workspace }: WorkspaceStatusItemProps) {
  if (isProvisioning(workspace) || isDeprovisioning(workspace)) {
    return <Loader size="xs" />;
  }
  return <FixedSizeIcon name="warning" c="text-secondary" aria-hidden />;
}

type WorkspaceInstanceItemProps = {
  instanceUrl: string | null;
};

function WorkspaceInstanceItem({ instanceUrl }: WorkspaceInstanceItemProps) {
  return (
    <Box c="text-secondary" lh="1rem">
      <Group gap="xs" wrap="nowrap">
        <FixedSizeIcon name="workspace" aria-hidden />
        {instanceUrl != null ? (
          <Anchor
            href={instanceUrl}
            target="_blank"
            rel="noopener noreferrer"
            lh="inherit"
          >
            {instanceUrl}
          </Anchor>
        ) : (
          t`No workspace instance yet`
        )}
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
        {getDatabaseName(workspaceDatabase)}
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
  const [provisionWorkspace, { isLoading: isProvisionLoading }] =
    useProvisionWorkspaceMutation();
  const [deprovisionWorkspace, { isLoading: isDeprovisionLoading }] =
    useDeprovisionWorkspaceMutation();
  const [deleteWorkspace, { isLoading: isDeleteLoading }] =
    useDeleteWorkspaceMutation();
  const { modalContent, show: showConfirmation } = useConfirmation();

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
              disabled={isProvisioning(workspace) || isProvisionLoading}
              onClick={() => provisionWorkspace(workspace.id)}
            >
              {t`Provision`}
            </Menu.Item>
          )}
          {!isDeprovisioned(workspace) && !isProvisioning(workspace) && (
            <Menu.Item
              leftSection={<FixedSizeIcon name="revert" aria-hidden />}
              disabled={isDeprovisioning(workspace) || isDeprovisionLoading}
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
            disabled={!isDeprovisioned(workspace) || isDeleteLoading}
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
