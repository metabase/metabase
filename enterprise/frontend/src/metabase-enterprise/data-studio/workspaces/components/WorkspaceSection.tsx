import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import dayjs from "dayjs";
import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal/ConfirmModal";
import { ForwardRefLink } from "metabase/common/components/Link";
import S from "metabase/data-studio/app/pages/DataStudioLayout/DataStudioLayout.module.css";
import type { MetabaseColorKey } from "metabase/lib/colors/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { WorkspacesSectionProps } from "metabase/plugins/oss/database";
import { getLocation } from "metabase/selectors/routing";
import {
  ActionIcon,
  FixedSizeIcon,
  Flex,
  Group,
  Icon,
  type IconName,
  Loader,
  Menu,
  Skeleton,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import {
  useArchiveWorkspaceMutation,
  useCreateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useGetWorkspacesQuery,
  useUnarchiveWorkspaceMutation,
} from "metabase-enterprise/api/workspace";
import type {
  Workspace,
  WorkspaceId,
  WorkspaceItem as WorkspaceItemType,
} from "metabase-types/api";

const TOOLTIP_OPEN_DELAY = 700;

export function WorkspacesSection({ showLabel }: WorkspacesSectionProps) {
  const dispatch = useDispatch();
  const [isWorkspacesExpanded, setIsWorkspacesExpanded] = useState(true);
  const { pathname } = useSelector(getLocation);
  const { data: workspacesData, isLoading: areWorkspacesLoading } =
    useGetWorkspacesQuery();
  const [createWorkspace, { isLoading: isCreatingWorkspace }] =
    useCreateWorkspaceMutation();

  const workspaces = useMemo(() => {
    return sortWorkspaceItems(workspacesData?.items ?? []);
  }, [workspacesData]);

  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleCreateWorkspace = useCallback(async () => {
    try {
      const workspace = await createWorkspace().unwrap();
      dispatch(push(Urls.dataStudioWorkspace(workspace.id)));
    } catch (error) {
      sendErrorToast(t`Failed to create workspace`);
    }
  }, [createWorkspace, dispatch, sendErrorToast]);

  const [archiveWorkspace] = useArchiveWorkspaceMutation();
  const [unarchiveWorkspace] = useUnarchiveWorkspaceMutation();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();

  const handleWorkspaceArchive = async (id: WorkspaceId) => {
    try {
      await archiveWorkspace(id).unwrap();
      sendSuccessToast(t`Workspace archived successfully`);
    } catch (error) {
      sendErrorToast(t`Failed to archive workspace`);
    }
  };

  const handleWorkspaceUnarchive = async (id: WorkspaceId) => {
    try {
      await unarchiveWorkspace(id).unwrap();
      sendSuccessToast(t`Workspace restored successfully`);
    } catch (error) {
      sendErrorToast(t`Failed to restore workspace`);
    }
  };

  const handleWorkspaceDelete = async (id: WorkspaceId) => {
    try {
      await deleteWorkspace(id).unwrap();
      sendSuccessToast(t`Workspace deleted successfully`);
      dispatch(push(Urls.dataStudioWorkspaceList()));
    } catch (error) {
      sendErrorToast(t`Failed to delete workspace`);
    }
  };

  const isWorkspaceListPage = pathname === Urls.dataStudioWorkspaceList();

  if (!showLabel) {
    // In collapsed mode, show only an icon button with tooltip
    return (
      <Tooltip
        label={t`Workspaces`}
        position="right"
        openDelay={TOOLTIP_OPEN_DELAY}
      >
        <UnstyledButton
          className={cx(S.tab, { [S.selected]: isWorkspaceListPage })}
          component={ForwardRefLink}
          to={Urls.dataStudioWorkspaceList()}
          p="0.75rem"
          bdrs="md"
        >
          <Flex align="center" justify="center">
            <FixedSizeIcon name="git_branch" display="block" />
          </Flex>
        </UnstyledButton>
      </Tooltip>
    );
  }

  return (
    <Stack
      data-testid="workspaces-section"
      gap="0.5rem"
      className={S.workspacesSection}
      flex={1}
      mih={0}
    >
      <UnstyledButton
        className={cx(S.workspacesSectionHeader, {
          [S.selected]: isWorkspaceListPage,
        })}
        onClick={() => setIsWorkspacesExpanded(!isWorkspacesExpanded)}
        p="0.75rem"
        bdrs="md"
      >
        <Flex align="center" justify="space-between" w="100%">
          <Text size="sm" fw={600}>
            {t`Workspaces`}
          </Text>
          <Icon
            name={isWorkspacesExpanded ? "chevrondown" : "chevronright"}
            size={16}
          />
        </Flex>
      </UnstyledButton>

      {isWorkspacesExpanded && (
        <>
          <UnstyledButton
            className={S.newWorkspaceButton}
            onClick={handleCreateWorkspace}
            disabled={isCreatingWorkspace || areWorkspacesLoading}
            p="0.5rem"
            bdrs="md"
          >
            <Flex align="center" gap="xs">
              {isCreatingWorkspace ? (
                <Loader size="xs" />
              ) : (
                <Icon name="add" size={16} />
              )}
              <Text c="inherit" size="sm" fw={500}>
                {t`New workspace`}
              </Text>
            </Flex>
          </UnstyledButton>
          <Stack
            gap="0.75rem"
            style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
          >
            {areWorkspacesLoading ? (
              <>
                <Skeleton height={80} radius="md" />
                <Skeleton height={80} radius="md" />
              </>
            ) : workspaces.length === 0 ? (
              <Text c="text-secondary" size="xs" px="0.5rem">
                {t`No workspaces yet`}
              </Text>
            ) : (
              workspaces.map((workspace) => {
                const isSelected =
                  pathname === Urls.dataStudioWorkspace(workspace.id);

                return (
                  <WorkspaceItem
                    key={workspace.id}
                    workspace={workspace}
                    isSelected={isSelected}
                    onArchive={handleWorkspaceArchive}
                    onUnarchive={handleWorkspaceUnarchive}
                    onDelete={handleWorkspaceDelete}
                  />
                );
              })
            )}
          </Stack>
        </>
      )}
    </Stack>
  );
}

interface WorkspaceItemProps {
  workspace: Workspace;
  isSelected: boolean;
  onArchive: (workspaceId: WorkspaceId) => Promise<void>;
  onUnarchive: (workspaceId: WorkspaceId) => Promise<void>;
  onDelete: (workspaceId: WorkspaceId) => Promise<void>;
}

function sortWorkspaceItems(
  items: WorkspaceItemType[] | undefined,
): WorkspaceItemType[] {
  const isArchived = (item: WorkspaceItemType) => item.status === "archived";

  return [...(items ?? [])].sort((a, b) => {
    // Archived workspaces should be placed at the end
    if (isArchived(a) !== isArchived(b)) {
      return isArchived(a) ? 1 : -1;
    }

    // Within each group (archived/unarchived), sort by updated_at descending
    const aDate = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const bDate = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return bDate - aDate;
  });
}

function WorkspaceItem({
  workspace,
  isSelected,
  onArchive,
  onUnarchive,
  onDelete,
}: WorkspaceItemProps) {
  const [
    deleteModalOpened,
    { open: openDeleteModal, close: closeDeleteModal },
  ] = useDisclosure();
  const timeAgo = workspace.updated_at
    ? dayjs(workspace.updated_at).fromNow()
    : null;

  const handleArchive = () => {
    onArchive(workspace.id);
  };

  const handleUnarchive = () => {
    onUnarchive(workspace.id);
  };

  const handleDelete = () => {
    openDeleteModal();
  };

  const handleConfirmDelete = async () => {
    await onDelete(workspace.id);
    closeDeleteModal();
  };

  const status = getWorkspaceListStatus(workspace);

  return (
    <UnstyledButton
      className={cx(S.workspaceItem, { [S.selected]: isSelected })}
      component={ForwardRefLink}
      to={Urls.dataStudioWorkspace(workspace.id)}
      p="0.75rem"
      bdrs="md"
      name={workspace.name}
    >
      <Flex align="flex-start" justify="space-between" gap="xs">
        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} truncate>
            {workspace.name}
          </Text>
          {status && (
            <Group
              gap="xs"
              align="center"
              wrap="nowrap"
              data-testid="workspace-status"
            >
              <Icon name={status.icon} size={10} c={status.color} />
              <Text size="xs" fw={500} c={status.color}>
                {status.label}
              </Text>
            </Group>
          )}
          {timeAgo && (
            <Text size="xs" c="text-secondary" truncate>
              {t`Updated ${timeAgo}`}
            </Text>
          )}
        </Stack>
        <Menu position="right" withinPortal>
          <Menu.Target>
            <ActionIcon
              className={S.workspaceMenuButton}
              component="span"
              aria-label={t`More actions`}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              size="sm"
              variant="subtle"
            >
              <Icon name="ellipsis" size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {workspace.status === "archived" ? (
              <>
                <Menu.Item
                  leftSection={<Icon name="revert" />}
                  onClick={handleUnarchive}
                >
                  {t`Restore`}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  c="error"
                  leftSection={<Icon name="trash" />}
                  onClick={handleDelete}
                  color="danger"
                >
                  {t`Delete`}
                </Menu.Item>
              </>
            ) : (
              <Menu.Item
                leftSection={<Icon name="archive" />}
                onClick={handleArchive}
              >
                {t`Archive`}
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </Flex>

      <ConfirmModal
        confirmButtonText={t`Delete`}
        message={t`This can't be undone.`}
        opened={deleteModalOpened}
        title={t`Delete ${workspace.name}?`}
        onClose={closeDeleteModal}
        onConfirm={handleConfirmDelete}
      />
    </UnstyledButton>
  );
}

type WorkspaceListStatus = {
  label: string;
  icon: IconName;
  color: MetabaseColorKey;
};

function getWorkspaceListStatus(workspace: Workspace): WorkspaceListStatus {
  if (workspace.status === "archived") {
    return { label: t`Archived`, icon: "archive", color: "text-tertiary" };
  }

  if (workspace.status === "pending") {
    return { label: t`Pending setup`, icon: "clock", color: "warning" };
  }

  return { label: t`Ready`, icon: "check", color: "success" };
}
