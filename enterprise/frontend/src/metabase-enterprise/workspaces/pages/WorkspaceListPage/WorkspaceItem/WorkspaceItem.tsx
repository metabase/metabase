import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/redux";
import { refreshCurrentUser } from "metabase/redux/user";
import { getUser } from "metabase/selectors/user";
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
import {
  useEnterWorkspaceMutation,
  useExitWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Workspace, WorkspaceDatabase } from "metabase-types/api";

import {
  getProvisioningFailureMessage,
  getWorkspaceDatabaseName,
  isUnprovisioned,
} from "../../../utils";
import { DeleteWorkspaceModal } from "../DeleteWorkspaceModal";
import { RenameWorkspaceModal } from "../RenameWorkspaceModal";

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
          {databases.some(isUnprovisioned) && <WorkspaceProvisioningWarning />}
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

type WorkspaceDatabaseItemProps = {
  workspaceDatabase: WorkspaceDatabase;
};

function WorkspaceProvisioningWarning() {
  return (
    <Box c="text-secondary" lh="1rem">
      <Group gap="xs" wrap="nowrap">
        <FixedSizeIcon name="warning" aria-hidden />
        {getProvisioningFailureMessage()}
      </Group>
    </Box>
  );
}

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
  const [isDeleteOpen, { open: openDelete, close: closeDelete }] =
    useDisclosure(false);
  const dispatch = useDispatch();
  const currentUser = useSelector(getUser);
  const [enterWorkspace] = useEnterWorkspaceMutation();
  const [exitWorkspace] = useExitWorkspaceMutation();
  const isCurrentWorkspace = currentUser?.workspace_id === workspace.id;

  const handleEnter = async () => {
    await enterWorkspace(workspace.id).unwrap();
    await dispatch(refreshCurrentUser());
  };

  const handleLeave = async () => {
    await exitWorkspace().unwrap();
    await dispatch(refreshCurrentUser());
  };

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon aria-label={t`Workspace options`}>
            <FixedSizeIcon name="ellipsis" aria-hidden />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {isCurrentWorkspace ? (
            <Menu.Item
              leftSection={<FixedSizeIcon name="close" aria-hidden />}
              onClick={handleLeave}
            >
              {t`Leave workspace`}
            </Menu.Item>
          ) : (
            <Menu.Item
              leftSection={<FixedSizeIcon name="arrow_right" aria-hidden />}
              onClick={handleEnter}
            >
              {t`Enter workspace`}
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
      {isDeleteOpen && (
        <DeleteWorkspaceModal
          workspaceId={workspace.id}
          onDelete={closeDelete}
          onClose={closeDelete}
        />
      )}
    </>
  );
}
