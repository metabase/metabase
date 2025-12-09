import cx from "classnames";
import dayjs from "dayjs";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import {
  ActionIcon,
  Box,
  FixedSizeIcon,
  Flex,
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
  useGetWorkspacesQuery,
} from "metabase-enterprise/api";
import { DataStudioContext } from "metabase-enterprise/data-studio/common/contexts/DataStudioContext";
import { CreateWorkspaceModal } from "metabase-enterprise/workspaces/components/CreateWorkspaceModal/CreateWorkspaceModal";
import type { Database, WorkspaceId } from "metabase-types/api";

import S from "./DataStudioLayout.module.css";

type DataStudioLayoutProps = {
  children?: ReactNode;
};

export function DataStudioLayout({ children }: DataStudioLayoutProps) {
  const [isSidebarOpened, setIsSidebarOpened] = useState(false);
  const [isSidebarAvailable, setIsSidebarAvailable] = useState(false);
  const [isNavExpanded, setIsNavExpanded] = useState(true);
  const contextValue = useMemo(
    () => ({
      isSidebarOpened,
      isSidebarAvailable,
      setIsSidebarOpened,
      setIsSidebarAvailable,
    }),
    [isSidebarOpened, isSidebarAvailable],
  );

  return (
    <DataStudioContext.Provider value={contextValue}>
      <Flex h="100%">
        <DataStudioNav
          isSidebarOpened={isSidebarOpened}
          isSidebarAvailable={isSidebarAvailable}
          onSidebarToggle={setIsSidebarOpened}
          isNavExpanded={isNavExpanded}
          onNavToggle={setIsNavExpanded}
        />
        <Box h="100%" flex={1} miw={0}>
          {children}
        </Box>
      </Flex>
    </DataStudioContext.Provider>
  );
}

type DataStudioNavProps = {
  isSidebarOpened: boolean;
  isSidebarAvailable: boolean;
  onSidebarToggle: (isOpened: boolean) => void;
  isNavExpanded: boolean;
  onNavToggle: (isExpanded: boolean) => void;
};

function DataStudioNav({
  isSidebarOpened,
  isSidebarAvailable,
  onSidebarToggle,
  isNavExpanded,
  onNavToggle,
}: DataStudioNavProps) {
  const { pathname } = useSelector(getLocation);
  const canAccessDataModel = useSelector(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel,
  );
  const canAccessTransforms = useSelector(
    PLUGIN_TRANSFORMS.canAccessTransforms,
  );
  const isDataTab = pathname.startsWith(Urls.dataStudioData());
  const isWorkspacePage = pathname.startsWith(Urls.dataStudioWorkspaceList());
  const isTransformsTab =
    pathname.startsWith(Urls.transformList()) && !isWorkspacePage;
  const isModelingTab = pathname.startsWith(Urls.dataStudioModeling());
  const isDependenciesTab = pathname.startsWith(Urls.dependencyGraph());

  return (
    <Stack
      className={cx(S.nav, { [S.navCollapsed]: !isNavExpanded })}
      h="100%"
      p="0.75rem"
      justify="space-between"
    >
      <Stack gap="0.75rem">
        <DataStudioNavToggle
          isNavExpanded={isNavExpanded}
          onNavToggle={onNavToggle}
        />
        <Stack gap="0.75rem">
          {canAccessDataModel && (
            <DataStudioTab
              label={t`Data`}
              icon="database"
              to={Urls.dataStudioData()}
              isSelected={isDataTab}
              isExpanded={isNavExpanded}
            />
          )}
          {canAccessTransforms && (
            <DataStudioTab
              label={t`Transforms`}
              icon="transform"
              to={Urls.transformList()}
              isSelected={isTransformsTab}
              isExpanded={isNavExpanded}
            />
          )}
          <DataStudioTab
            label={t`Modeling`}
            icon="model"
            to={Urls.dataStudioModeling()}
            isSelected={isModelingTab}
            isExpanded={isNavExpanded}
          />
          {PLUGIN_DEPENDENCIES.isEnabled && (
            <DataStudioTab
              label={t`Dependency graph`}
              icon="schema"
              to={Urls.dependencyGraph()}
              isSelected={isDependenciesTab}
              isExpanded={isNavExpanded}
            />
          )}
        </Stack>
        {canAccessTransforms && (
          <WorkspacesSection isExpanded={isNavExpanded} />
        )}
      </Stack>
      {isSidebarAvailable && (
        <DataStudioSidebarToggle
          isSidebarOpened={isSidebarOpened}
          onSidebarToggle={onSidebarToggle}
        />
      )}
    </Stack>
  );
}

type DataStudioTabProps = {
  label: string;
  icon: IconName;
  to: string;
  isSelected: boolean;
  isExpanded: boolean;
};

const TOOLTIP_OPEN_DELAY = 1000;

function DataStudioTab({
  label,
  icon,
  to,
  isSelected,
  isExpanded,
}: DataStudioTabProps) {
  const content = (
    <Box
      className={cx(S.tab, { [S.selected]: isSelected })}
      component={ForwardRefLink}
      to={to}
      p="0.75rem"
      bdrs="md"
    >
      <Flex
        align="center"
        gap="sm"
        justify={isExpanded ? "flex-start" : "center"}
      >
        <FixedSizeIcon name={icon} display="block" />
        {isExpanded && (
          <Text size="sm" fw={600}>
            {label}
          </Text>
        )}
      </Flex>
    </Box>
  );

  if (!isExpanded) {
    return (
      <Tooltip label={label} position="right" openDelay={TOOLTIP_OPEN_DELAY}>
        {content}
      </Tooltip>
    );
  }

  return content;
}

type WorkspacesSectionProps = {
  isExpanded: boolean;
};

function WorkspacesSection({
  isExpanded: isNavExpanded,
}: WorkspacesSectionProps) {
  const dispatch = useDispatch();
  const [isWorkspacesExpanded, setIsWorkspacesExpanded] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { pathname } = useSelector(getLocation);
  const { data: workspacesData, isLoading } = useGetWorkspacesQuery();
  const { data: databaseData, isLoading: isLoadingDatabases } =
    useListDatabasesQuery({ include_analytics: true });
  const [createWorkspace, { isLoading: isCreating }] =
    useCreateWorkspaceMutation();

  const workspaces = useMemo(
    () =>
      [...(workspacesData?.items ?? [])].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    [workspacesData],
  );

  const databaseOptions = useMemo(
    () =>
      (databaseData?.data ?? []).map((db: Database) => ({
        value: String(db.id),
        label: db.name,
      })),
    [databaseData],
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
          upstream: {},
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
  const handleWorkspaceArchive = async (id: WorkspaceId) => {
    try {
      await archiveWorkspace(id).unwrap();
      sendSuccessToast(t`Workspace archived successfully`);
      dispatch(push(Urls.dataStudioWorkspaceList()));
    } catch (error) {
      sendErrorToast(t`Failed to archive workspace`);
    }
  };

  const isWorkspaceListPage = pathname === Urls.dataStudioWorkspaceList();

  if (!isNavExpanded) {
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
    <Stack data-testid="workspaces-section" gap="0.5rem" className={S.workspacesSection}>
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
          <Stack gap="0.75rem" style={{ overflowY: "auto", maxHeight: "50vh" }}>
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
                    archiveWorkspace={handleWorkspaceArchive}
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
      />
    </Stack>
  );
}

type DataStudioSidebarToggleProps = {
  isSidebarOpened: boolean;
  onSidebarToggle: (isOpened: boolean) => void;
};

function DataStudioSidebarToggle({
  isSidebarOpened,
  onSidebarToggle,
}: DataStudioSidebarToggleProps) {
  return (
    <Tooltip
      label={isSidebarOpened ? t`Close sidebar` : t`Open sidebar`}
      position="right"
      openDelay={TOOLTIP_OPEN_DELAY}
    >
      <UnstyledButton
        className={S.toggle}
        p="0.75rem"
        bdrs="md"
        onClick={() => onSidebarToggle(!isSidebarOpened)}
      >
        <FixedSizeIcon
          name={isSidebarOpened ? "sidebar_closed" : "sidebar_open"}
        />
      </UnstyledButton>
    </Tooltip>
  );
}

type DataStudioNavToggleProps = {
  isNavExpanded: boolean;
  onNavToggle: (isExpanded: boolean) => void;
};

function DataStudioNavToggle({
  isNavExpanded,
  onNavToggle,
}: DataStudioNavToggleProps) {
  return (
    <Tooltip
      label={isNavExpanded ? t`Collapse navigation` : t`Expand navigation`}
      position="right"
      openDelay={TOOLTIP_OPEN_DELAY}
    >
      <UnstyledButton
        className={S.toggle}
        p="0.75rem"
        bdrs="md"
        onClick={() => onNavToggle(!isNavExpanded)}
      >
        <FixedSizeIcon name={isNavExpanded ? "chevronleft" : "chevronright"} />
      </UnstyledButton>
    </Tooltip>
  );
}

interface WorkspaceItemProps {
  workspace: { id: number; name: string; updated_at: string };
  isSelected: boolean;
  onOpen: (workspaceId: WorkspaceId) => void;
  archiveWorkspace: (workspaceId: WorkspaceId) => Promise<void>;
}

function WorkspaceItem({
  workspace,
  isSelected,
  onOpen,
  archiveWorkspace,
}: WorkspaceItemProps) {
  const timeAgo = dayjs(workspace.updated_at).fromNow();
  const handleArchive = () => {
    archiveWorkspace(workspace.id);
  };

  const handleDelete = () => {
    archiveWorkspace(workspace.id);
  };

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
          <Text size="xs" c="text-secondary" truncate>
            {t`Updated ${timeAgo}`}
          </Text>
        </Stack>
        <Menu position="right" withinPortal>
          <Menu.Target>
            <ActionIcon
              className={S.workspaceMenuButton}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              size="sm"
              variant="subtle"
            >
              <Icon name="ellipsis" size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <Menu.Item
              leftSection={<Icon name="archive" />}
              onClick={handleArchive}
            >
              {t`Archive`}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              leftSection={<Icon name="trash" />}
              onClick={handleDelete}
            >
              {t`Move to trash`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Flex>
    </UnstyledButton>
  );
}
