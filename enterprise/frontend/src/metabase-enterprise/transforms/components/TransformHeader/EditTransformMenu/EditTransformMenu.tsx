import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

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
  useGetWorkspaceCheckoutQuery,
  useGetWorkspacesQuery,
} from "metabase-enterprise/api";
import type { DatabaseId, Transform, Workspace } from "metabase-types/api";

type EditTransformMenuProps = {
  transform: Transform;
};

export function EditTransformMenu({ transform }: EditTransformMenuProps) {
  const dispatch = useDispatch();
  const { sendErrorToast } = useMetadataToasts();

  const sourceDatabaseId = getTransformDatabaseId(transform);

  const { data: workspacesData, isLoading: isLoadingWorkspaces } =
    useGetWorkspacesQuery();
  const [createWorkspace, { isLoading: isCreatingWorkspace }] =
    useCreateWorkspaceMutation();
  const { data: checkoutData, isLoading: isWorkspaceCheckoutLoading } =
    useGetWorkspaceCheckoutQuery(transform.id);

  const workspaces = useMemo(
    () => workspacesData?.items ?? [],
    [workspacesData],
  );

  const matchingWorkspaceIds = useMemo(() => {
    const allMatchingWorkspaceIds =
      workspaces
        ?.filter((item) => item.database_id === sourceDatabaseId)
        ?.map((item) => item.id) ?? [];

    // Workspaces which already include this transform.
    const checkedWorkspaceIds =
      checkoutData?.transforms?.map((item) => item.workspace?.id) ?? [];
    return new Set([...checkedWorkspaceIds, ...allMatchingWorkspaceIds]);
  }, [checkoutData?.transforms, workspaces, sourceDatabaseId]);

  const matchingWorkspaces = useMemo(
    () =>
      workspaces.filter(
        (workspace) =>
          matchingWorkspaceIds.has(workspace.id) && !workspace.archived,
      ),
    [workspaces, matchingWorkspaceIds],
  );

  const isBusy =
    isCreatingWorkspace || isLoadingWorkspaces || isWorkspaceCheckoutLoading;
  const emptyMessage =
    workspaces.length === 0 || sourceDatabaseId == null
      ? t`No workspaces yet`
      : t`No workspaces for this database yet`;

  const handleWorkspaceSelect = async (workspace: Workspace) => {
    dispatch(
      push(
        `/data-studio/workspaces/${workspace.id}?transformId=${transform.id}`,
      ),
    );
  };

  const handleCreateWorkspace = async ({
    name,
    databaseId,
  }: {
    name?: string;
    databaseId?: DatabaseId;
  }) => {
    if (!databaseId) {
      sendErrorToast(t`Failed to create workspace, no database id`);
      return;
    }

    try {
      const workspace = await createWorkspace({
        name: name?.trim() || t`New workspace`,
        database_id: Number(databaseId),
      }).unwrap();

      dispatch(
        push(
          `/data-studio/workspaces/${workspace.id}?transformId=${transform.id}`,
        ),
      );
    } catch (error) {
      console.error(error);
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
          onClick={() => {
            handleCreateWorkspace({ databaseId: sourceDatabaseId });
          }}
        >
          <Stack gap={0} align="flex-start">
            <Text fw={600}>{t`New workspace`}</Text>
            <Text size="sm" c="text-light">
              {t`Create a new workspace`}
            </Text>
          </Stack>
        </Menu.Item>
        <Menu.Divider />

        {isLoadingWorkspaces || isWorkspaceCheckoutLoading ? (
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
                    {workspace.created_at && (
                      <Text size="sm" c="text-light">
                        {formatWorkspaceDate(workspace.created_at)}
                      </Text>
                    )}
                  </Stack>
                </Menu.Item>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Menu.Dropdown>
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
