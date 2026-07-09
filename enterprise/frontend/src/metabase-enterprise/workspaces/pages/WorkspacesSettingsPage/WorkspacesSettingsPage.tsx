import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { AdminSettingsTableEmptyState } from "metabase/admin/components/AdminSettingsTable";
import S from "metabase/admin/components/AdminSettingsTable/AdminSettingsTable.module.css";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { DateTime } from "metabase/common/components/DateTime";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Ellipsified,
  Group,
  Icon,
  Menu,
  Text,
  Title,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import {
  useListWorkspaceInstancesQuery,
  useListWorkspacesQuery,
} from "metabase-enterprise/api";
import type { WorkspaceInstance } from "metabase-types/api";

import { DeleteInstanceModal } from "./DeleteInstanceModal";
import { InstanceModal } from "./InstanceModal";

type Modal = null | "connect" | "edit" | "delete";

const getNodeId = (instance: WorkspaceInstance) => String(instance.id);

function InstanceActionsMenu({
  instance,
  onEdit,
  onDelete,
}: {
  instance: WorkspaceInstance;
  onEdit: (instance: WorkspaceInstance) => void;
  onDelete: (instance: WorkspaceInstance) => void;
}) {
  return (
    <Menu shadow="md" position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          aria-label={t`Instance options`}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
        <Menu.Item
          leftSection={<Icon name="pencil" />}
          onClick={() => onEdit(instance)}
        >
          {t`Edit`}
        </Menu.Item>
        <Menu.Item
          leftSection={<Icon name="trash" />}
          onClick={() => onDelete(instance)}
        >
          {t`Disconnect`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function useInstanceColumns({
  workspaceNamesById,
  onEdit,
  onDelete,
}: {
  workspaceNamesById: Map<number, string>;
  onEdit: (instance: WorkspaceInstance) => void;
  onDelete: (instance: WorkspaceInstance) => void;
}): TreeTableColumnDef<WorkspaceInstance>[] {
  return useMemo(
    () => [
      {
        id: "name",
        header: t`Name`,
        minWidth: 140,
        enableSorting: true,
        accessorFn: (instance) => instance.name,
        cell: ({ row }) => <Ellipsified>{row.original.name}</Ellipsified>,
      },
      {
        id: "url",
        header: t`URL`,
        minWidth: 140,
        enableSorting: true,
        accessorFn: (instance) => instance.url,
        cell: ({ row }) => <Ellipsified>{row.original.url}</Ellipsified>,
      },
      {
        id: "workspace",
        header: t`Used by`,
        minWidth: 130,
        enableSorting: true,
        accessorFn: (instance) =>
          instance.workspace_id != null
            ? (workspaceNamesById.get(instance.workspace_id) ?? "")
            : "",
        cell: ({ row }) => {
          const { workspace_id } = row.original;
          if (workspace_id == null) {
            return <Text c="text-secondary">{t`Available`}</Text>;
          }
          const workspaceName = workspaceNamesById.get(workspace_id);
          return workspaceName != null ? (
            <Ellipsified>{workspaceName}</Ellipsified>
          ) : (
            <Text c="text-secondary">{t`A workspace`}</Text>
          );
        },
      },
      {
        id: "initialized_at",
        header: t`Set up`,
        width: 200,
        enableSorting: true,
        sortDescFirst: true,
        accessorFn: (instance) => instance.initialized_at ?? "",
        cell: ({ row }) =>
          row.original.initialized_at != null ? (
            <DateTime value={row.original.initialized_at} unit="minute" />
          ) : (
            <Text c="text-secondary">{t`Not set up yet`}</Text>
          ),
      },
      {
        id: "actions",
        header: "",
        width: 64,
        enableSorting: false,
        cell: ({ row }) => (
          <InstanceActionsMenu
            instance={row.original}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ),
      },
    ],
    [workspaceNamesById, onEdit, onDelete],
  );
}

function InstancesTable({
  instances,
  workspaceNamesById,
  onEdit,
  onDelete,
}: {
  instances: WorkspaceInstance[];
  workspaceNamesById: Map<number, string>;
  onEdit: (instance: WorkspaceInstance) => void;
  onDelete: (instance: WorkspaceInstance) => void;
}) {
  const columns = useInstanceColumns({ workspaceNamesById, onEdit, onDelete });
  const instance = useTreeTableInstance<WorkspaceInstance>({
    data: instances,
    columns,
    getNodeId,
    defaultRowHeight: 48,
  });

  const getRowProps = useCallback(
    (row: Row<WorkspaceInstance>) => ({
      "data-testid": `instance-row-${row.original.id}`,
      "aria-label": row.original.name,
    }),
    [],
  );

  const handleRowClick = useCallback(
    (row: Row<WorkspaceInstance>) => onEdit(row.original),
    [onEdit],
  );

  return (
    <Box data-testid="instance-list">
      <TreeTable
        instance={instance}
        hierarchical={false}
        headerVariant="pill"
        ariaLabel={t`Workspace instances`}
        getRowProps={getRowProps}
        onRowClick={handleRowClick}
        classNames={{ cell: S.cell, row: S.row }}
      />
    </Box>
  );
}

export function WorkspacesSettingsPage() {
  const [modal, setModal] = useState<Modal>(null);
  const [activeInstance, setActiveInstance] =
    useState<WorkspaceInstance | null>(null);

  const applicationName = useSelector(getApplicationName);
  const {
    data: instances,
    isLoading: isLoadingInstances,
    error: instancesError,
  } = useListWorkspaceInstancesQuery();
  const {
    data: workspaces,
    isLoading: isLoadingWorkspaces,
    error: workspacesError,
  } = useListWorkspacesQuery();

  const isLoading = isLoadingInstances || isLoadingWorkspaces;
  const error = instancesError ?? workspacesError;
  const showLoadingOrError = isLoading || error != null;

  const workspaceNamesById = useMemo(
    () =>
      new Map(
        (workspaces ?? []).map((workspace) => [workspace.id, workspace.name]),
      ),
    [workspaces],
  );

  const handleClose = () => setModal(null);
  const handleEdit = useCallback((instance: WorkspaceInstance) => {
    setActiveInstance(instance);
    setModal("edit");
  }, []);
  const handleDelete = useCallback((instance: WorkspaceInstance) => {
    setActiveInstance(instance);
    setModal("delete");
  }, []);

  const hasInstances = instances != null && instances.length > 0;

  return (
    <SettingsPageWrapper data-testid="workspaces-settings-page">
      <InstanceModals
        modal={modal}
        activeInstance={activeInstance}
        onClose={handleClose}
      />
      <Group justify="space-between" align="flex-start" gap="xl">
        <Box>
          <Title order={1}>{t`Workspaces`}</Title>
          <Text c="text-secondary" maw="40rem">
            {t`Connect a child ${applicationName} instance by its URL and an admin API key created on it. You can then pick an instance when creating a workspace, and this ${applicationName} will set the instance up with the workspace's databases and settings.`}
          </Text>
        </Box>
        <Button variant="filled" onClick={() => setModal("connect")}>
          {t`Connect an instance`}
        </Button>
      </Group>
      <Card withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
        {showLoadingOrError ? (
          <Box p="xl" mih="20rem">
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Box>
        ) : hasInstances ? (
          <InstancesTable
            instances={instances}
            workspaceNamesById={workspaceNamesById}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ) : (
          <AdminSettingsTableEmptyState
            message={t`No instances connected yet`}
          />
        )}
      </Card>
    </SettingsPageWrapper>
  );
}

function InstanceModals({
  modal,
  activeInstance,
  onClose,
}: {
  modal: Modal;
  activeInstance: WorkspaceInstance | null;
  onClose: () => void;
}) {
  if (modal === "connect") {
    return <InstanceModal opened onClose={onClose} />;
  }

  if (modal === "edit" && activeInstance) {
    return <InstanceModal opened instance={activeInstance} onClose={onClose} />;
  }

  if (modal === "delete" && activeInstance) {
    return (
      <DeleteInstanceModal opened instance={activeInstance} onClose={onClose} />
    );
  }

  return null;
}
