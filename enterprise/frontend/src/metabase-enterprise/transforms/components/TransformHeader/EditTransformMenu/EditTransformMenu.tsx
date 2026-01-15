import { useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
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
  Tooltip,
} from "metabase/ui";
import {
  useCreateWorkspaceMutation,
  useGetWorkspaceCheckoutQuery,
  useGetWorkspacesQuery,
} from "metabase-enterprise/api";
import { getCheckoutDisabledMessage } from "metabase-enterprise/data-studio/workspaces/utils";
import type { DatabaseId, Transform } from "metabase-types/api";

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
    () =>
      workspacesData?.items.filter((item) => item?.status !== "archived") ?? [],
    [workspacesData],
  );

  const matchingWorkspaces = useMemo(() => {
    const allMatchingWorkspaceIds =
      workspaces
        ?.filter((item) => item.database_id === sourceDatabaseId)
        ?.map((item) => item.id) ?? [];

    // Workspaces which already include this transform.
    const checkedWorkspaceIds =
      checkoutData?.workspaces?.map((item) => item?.id) ?? [];

    return Array.from(
      new Set([...checkedWorkspaceIds, ...allMatchingWorkspaceIds]),
    )
      .map((id) => {
        const workspace = workspaces.find((ws) => ws.id === id);
        if (!workspace) {
          return null;
        }
        return {
          id,
          isChecked: checkedWorkspaceIds.includes(id),
          name: workspace.name,
        };
      })
      .filter((workspace) => !!workspace);
  }, [checkoutData?.workspaces, workspaces, sourceDatabaseId]);

  const isBusy =
    isCreatingWorkspace || isLoadingWorkspaces || isWorkspaceCheckoutLoading;
  const emptyMessage =
    workspaces.length === 0 || sourceDatabaseId == null
      ? t`No workspaces yet`
      : t`No workspaces for this database yet`;

  const handleWorkspaceSelect = async (workspace: {
    id: number;
    name?: string;
  }) => {
    dispatch(push(Urls.dataStudioWorkspace(workspace.id, transform.id)));
  };

  const handleCreateWorkspace = async ({
    databaseId,
  }: {
    databaseId?: DatabaseId | null;
  }) => {
    if (!databaseId) {
      sendErrorToast(t`Failed to create workspace, no database id`);
      return;
    }

    try {
      const workspace = await createWorkspace({
        database_id: Number(databaseId),
      }).unwrap();

      dispatch(push(Urls.dataStudioWorkspace(workspace.id, transform.id)));
    } catch (error) {
      sendErrorToast(t`Failed to create workspace`);
    }
  };

  return (
    <Menu position="bottom-end" width={280}>
      <Menu.Target>
        <Tooltip
          label={getCheckoutDisabledMessage(checkoutData?.checkout_disabled)}
          disabled={!checkoutData?.checkout_disabled}
        >
          <Button
            size="sm"
            variant="filled"
            leftSection={<Icon name="pencil" />}
            rightSection={<Icon name="chevrondown" />}
            loading={isBusy}
            disabled={!!checkoutData?.checkout_disabled}
          >
            {t`Edit transform`}
          </Button>
        </Tooltip>
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
                  leftSection={
                    <Icon
                      name="sparkles"
                      c={workspace.isChecked ? "brand" : "text-dark"}
                    />
                  }
                  onClick={() => handleWorkspaceSelect(workspace)}
                  disabled={isBusy}
                >
                  <Stack gap={2} align="flex-start">
                    <Text fw={600}>{workspace.name}</Text>
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
