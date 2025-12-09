import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Menu,
  ScrollArea,
  Stack,
  Text,
} from "metabase/ui";
import {
  useCreateWorkspaceMutation,
  useGetTransformDownstreamMappingQuery,
  useGetWorkspacesQuery,
  useUpdateWorkspaceContentsMutation,
} from "metabase-enterprise/api";
import { CreateWorkspaceModal } from "metabase-enterprise/workspaces/components/CreateWorkspaceModal/CreateWorkspaceModal";
import type { Transform, Workspace } from "metabase-types/api";

type EditTransformMenuProps = {
  transform: Transform;
};

export function EditTransformMenu({ transform }: EditTransformMenuProps) {
  const dispatch = useDispatch();
  const { sendErrorToast } = useMetadataToasts();

  const sourceDatabaseId = getTransformDatabaseId(transform);

  const { data: workspacesData, isLoading: isLoadingWorkspaces } =
    useGetWorkspacesQuery();
  const [updateWorkspaceContents, { isLoading: isUpdatingWorkspace }] =
    useUpdateWorkspaceContentsMutation();
  const [createWorkspace, { isLoading: isCreatingWorkspace }] =
    useCreateWorkspaceMutation();
  const { data: downstreamMapping } = useGetTransformDownstreamMappingQuery(
    transform.id,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [addedWorkspaceIds, setAddedWorkspaceIds] = useState<Set<number>>(
    () => new Set(),
  );

  const { data: databasesData } = useListDatabasesQuery({
    include_analytics: true,
  });
  const workspaces = useMemo(
    () => workspacesData?.items ?? [],
    [workspacesData],
  );

  const existingWorkspaceIds = useMemo(() => {
    const ids = new Set<number>();
    downstreamMapping?.transforms?.forEach((item) => {
      if (item.workspace?.id != null) {
        ids.add(item.workspace.id);
      }
    });
    addedWorkspaceIds.forEach((id) => ids.add(id));
    return ids;
  }, [downstreamMapping, addedWorkspaceIds]);

  const matchingWorkspaces = useMemo(
    () =>
      workspaces
        .filter((workspace) => !existingWorkspaceIds.has(workspace.id))
        .filter((workspace) =>
          sourceDatabaseId == null
            ? true
            : workspace.database_id === sourceDatabaseId,
        ),
    [workspaces, sourceDatabaseId, existingWorkspaceIds],
  );

  const isBusy = isUpdatingWorkspace || isCreatingWorkspace;
  const emptyMessage =
    workspaces.length === 0 || sourceDatabaseId == null
      ? t`No workspaces yet`
      : t`No workspaces for this database yet`;
  const databaseOptions = useMemo(
    () =>
      (databasesData?.data ?? []).map((db) => ({
        value: String(db.id),
        label: db.name,
      })),
    [databasesData],
  );

  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
  };

  const handleWorkspaceSelect = async (workspace: Workspace) => {
    try {
      await updateWorkspaceContents({
        id: workspace.id,
        add: { transforms: [transform.id] },
      }).unwrap();
      setAddedWorkspaceIds((prev) => new Set(prev).add(workspace.id));
    } catch (error) {
      sendErrorToast(t`Failed to add transform to the workspace`);
    }
  };

  const handleCreateWorkspace = async ({
    name,
    databaseId,
  }: {
    name: string;
    databaseId: string;
  }) => {
    try {
      const workspace = await createWorkspace({
        name: name.trim() || t`New workspace`,
        database_id: Number(databaseId),
        upstream: { transforms: [transform.id] },
      }).unwrap();

      setAddedWorkspaceIds((prev) => new Set(prev).add(workspace.id));
      handleCloseCreateModal();
      dispatch(push(`/data-studio/workspaces/${workspace.id}`));
    } catch (error) {
      sendErrorToast(t`Failed to create workspace`);
    }
  };

  return (
    <Menu position="bottom-end" width={280}>
      <Menu.Target>
        <Button
          size="sm"
          variant="filled"
          leftSection={<Icon name="pencil" />}
          rightSection={<Icon name="chevrondown" />}
          loading={isBusy}
        >
          {t`Edit transform`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t`Add to workspace`}</Menu.Label>
        <Menu.Item
          disabled={isBusy}
          leftSection={<Icon name="add" />}
          onClick={handleOpenCreateModal}
        >
          <Stack gap={0} align="flex-start">
            <Text fw={600}>{t`New workspace`}</Text>
            <Text size="sm" c="text-light">
              {t`Create a new workspace`}
            </Text>
          </Stack>
        </Menu.Item>
        <Menu.Divider />

        {isLoadingWorkspaces ? (
          <Flex justify="center" align="center" py="md">
            <Loader size="sm" />
          </Flex>
        ) : matchingWorkspaces.length === 0 ? (
          <Box px="md" py="sm">
            <Text size="sm" c="text-light">
              {emptyMessage}
            </Text>
          </Box>
        ) : (
          <ScrollArea.Autosize mah={320} type="scroll">
            <Stack gap={0}>
              {matchingWorkspaces.map((workspace) => (
                <Menu.Item
                  key={workspace.id}
                  leftSection={<Icon name="sparkles" />}
                  onClick={() => handleWorkspaceSelect(workspace)}
                  disabled={isBusy}
                >
                  <Stack gap={2} align="flex-start">
                    <Text fw={600}>{workspace.name}</Text>
                    <Text size="sm" c="text-light">
                      {formatWorkspaceDate(workspace.created_at)}
                    </Text>
                  </Stack>
                </Menu.Item>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Menu.Dropdown>

      <CreateWorkspaceModal
        opened={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        onSubmit={handleCreateWorkspace}
        databaseOptions={databaseOptions}
        isSubmitting={isBusy}
        defaultDatabaseId={
          sourceDatabaseId != null ? String(sourceDatabaseId) : null
        }
      />
    </Menu>
  );
}

function getTransformDatabaseId(transform: Transform) {
  if (
    transform.source_type === "python" &&
    "source-database" in transform.source
  ) {
    return transform.source["source-database"];
  }

  if ("query" in transform.source) {
    return transform.source.query.database;
  }

  return undefined;
}

function formatWorkspaceDate(createdAt: string) {
  return dayjs(createdAt).format("DD/MM/YYYY");
}
