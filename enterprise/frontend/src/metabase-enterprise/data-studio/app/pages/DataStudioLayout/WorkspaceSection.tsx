import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import dayjs from "dayjs";
import { useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal/ConfirmModal";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { getLocation } from "metabase/selectors/routing";
import {
  ActionIcon,
  FixedSizeIcon,
  Flex,
  Group,
  Icon,
  type IconName,
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
  useGetWorkspaceAllowedDatabasesQuery,
  useGetWorkspacesQuery,
  useUnarchiveWorkspaceMutation,
} from "metabase-enterprise/api/workspace";
import { CreateWorkspaceModal } from "metabase-enterprise/data-studio/workspaces/components/CreateWorkspaceModal/CreateWorkspaceModal";
import { useRecentWorkspaceDatabaseId } from "metabase-enterprise/data-studio/workspaces/hooks/use-recent-workspace-database-id";
import { TOOLTIP_OPEN_DELAY } from "metabase-enterprise/dependencies/components/DependencyGraph/constants";
import type { Workspace, WorkspaceId } from "metabase-types/api/workspace";

import S from "./DataStudioLayout.module.css";

type WorkspacesSectionProps = {
  showLabel: boolean;
};

function WorkspacesSection({ showLabel }: WorkspacesSectionProps) {
  const dispatch = useDispatch();
  const [isWorkspacesExpanded, setIsWorkspacesExpanded] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { pathname } = useSelector(getLocation);
  const { data: workspacesData, isLoading } = useGetWorkspacesQuery();
  const { data: allowedDatabasesData, isLoading: isLoadingDatabases } =
    useGetWorkspaceAllowedDatabasesQuery();
  const [createWorkspace, { isLoading: isCreating }] =
    useCreateWorkspaceMutation();

  const workspaces = useMemo(
    () =>
      [...(workspacesData?.items ?? [])].sort((a, b) => {
        // Archived workspaces should be placed at the end
        if (a.archived !== b.archived) {
          return a.archived ? 1 : -1;
        }

        // Within each group (archived/unarchived), sort by updated_at descending
        const aDate = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bDate = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return bDate - aDate;
      }),
    [workspacesData],
  );

  const databaseOptions = useMemo(
    () =>
      (allowedDatabasesData?.databases ?? []).map((db) => ({
        value: String(db.id),
        label: db.name,
        disabled: !db.supported,
      })),
    [allowedDatabasesData],
  );

  const defaultDatabaseId = useRecentWorkspaceDatabaseId(
    workspaces,
    databaseOptions,
  );

  const handleOpenWorkspace = useCallback(
    (workspaceId: number) => {
      dispatch(push(Urls.dataStudioWorkspace(workspaceId)));
    },
    [dispatch],
  );

  const handleOpenCreateModal = useCallback(() => {
    setIsCreateModalOpen(true);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, []);

  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleCreateWorkspace = useCallback(
    async ({ name, databaseId }: { name: string; databaseId: string }) => {
      try {
        const workspace = await createWorkspace({
          name,
          database_id: Number(databaseId),
        }).unwrap();
        handleCloseCreateModal();
        handleOpenWorkspace(workspace.id);
      } catch (error) {
        sendErrorToast(t`Failed to create workspace`);
      }
    },
    [
      createWorkspace,
      handleCloseCreateModal,
      handleOpenWorkspace,
      sendErrorToast,
    ],
  );

  const [archiveWorkspace] = useArchiveWorkspaceMutation();
  const [unarchiveWorkspace] = useUnarchiveWorkspaceMutation();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();

  const handleWorkspaceArchive = async (id: WorkspaceId) => {
    try {
      await archiveWorkspace(id).unwrap();
      sendSuccessToast(t`Workspace archived successfully`);
      dispatch(push(Urls.dataStudioWorkspaceList()));
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
            onClick={handleOpenCreateModal}
            disabled={isLoadingDatabases}
            p="0.5rem"
            bdrs="md"
          >
            <Flex align="center" gap="xs">
              <Icon name="add" size={16} />
              <Text size="sm" fw={500}>
                {t`New workspace`}
              </Text>
            </Flex>
          </UnstyledButton>
          <Stack
            gap="0.75rem"
            style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
          >
            {isLoading ? (
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
                    onOpen={handleOpenWorkspace}
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

      <CreateWorkspaceModal
        opened={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onSubmit={handleCreateWorkspace}
        databaseOptions={databaseOptions}
        isSubmitting={isCreating}
        defaultDatabaseId={defaultDatabaseId}
      />
    </Stack>
  );
}

export { WorkspacesSection };

interface WorkspaceItemProps {
  workspace: Workspace;
  isSelected: boolean;
  onOpen: (workspaceId: WorkspaceId) => void;
  onArchive: (workspaceId: WorkspaceId) => Promise<void>;
  onUnarchive: (workspaceId: WorkspaceId) => Promise<void>;
  onDelete: (workspaceId: WorkspaceId) => Promise<void>;
}

function WorkspaceItem({
  workspace,
  isSelected,
  onOpen,
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
      onClick={() => onOpen(workspace.id)}
      p="0.75rem"
      bdrs="md"
    >
      <Flex align="flex-start" justify="space-between" gap="xs">
        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} truncate>
            {workspace.name}
          </Text>
          {status && (
            <Group gap="xs" align="center" wrap="nowrap">
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
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              size="sm"
              variant="subtle"
            >
              <Icon name="ellipsis" size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            {workspace.archived ? (
              <Menu.Item
                leftSection={<Icon name="revert" />}
                onClick={handleUnarchive}
              >
                {t`Restore`}
              </Menu.Item>
            ) : (
              <Menu.Item
                leftSection={<Icon name="archive" />}
                onClick={handleArchive}
              >
                {t`Archive`}
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item
              c="error"
              leftSection={<Icon name="trash" />}
              onClick={handleDelete}
              color="danger"
            >
              {t`Delete`}
            </Menu.Item>
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
  color: string;
};

function getWorkspaceListStatus(workspace: Workspace): WorkspaceListStatus {
  if (workspace.archived) {
    return { label: t`Archived`, icon: "archive", color: "text-light" };
  }

  if (workspace.status === "pending") {
    return { label: t`Pending setup`, icon: "clock", color: "warning" };
  }

  return { label: t`Ready`, icon: "check", color: "success" };
}
