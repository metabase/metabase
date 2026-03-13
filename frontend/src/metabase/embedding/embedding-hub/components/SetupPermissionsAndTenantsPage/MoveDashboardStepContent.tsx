import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  Api,
  useCreateDashboardMutation,
  useListCollectionItemsQuery,
  useListCollectionsTreeQuery,
  useUpdateDashboardMutation,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import { getErrorMessage } from "metabase/api/utils";
import { DashboardSelector } from "metabase/common/components/DashboardSelector";
import { useToast } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { Box, Button, Divider, Group, Stack, Text } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

import {
  useLastXrayDashboard,
  useMoveXrayDashboardToSharedCollection,
} from "./hooks/use-xray-dashboards";

interface MoveDashboardStepContentProps {
  onCompleted: () => void;
}

export const MoveDashboardStepContent = ({
  onCompleted,
}: MoveDashboardStepContentProps) => {
  const dispatch = useDispatch();
  const [sendToast] = useToast();

  const { data: sharedTenantCollections } = useListCollectionsTreeQuery({
    namespace: "shared-tenant-collection",
  });

  const sharedCollectionId =
    sharedTenantCollections && sharedTenantCollections.length > 0
      ? sharedTenantCollections[0].id
      : null;

  // Check if shared collection already has dashboards
  const { data: sharedCollectionItems } = useListCollectionItemsQuery(
    sharedCollectionId
      ? { id: sharedCollectionId, models: ["dashboard"] }
      : ({} as never),
    { skip: !sharedCollectionId },
  );

  const sharedCollectionHasDashboards =
    (sharedCollectionItems?.data?.length ?? 0) > 0;

  const { lastDashboard } = useLastXrayDashboard();
  const { moveDashboard, isMoving } = useMoveXrayDashboardToSharedCollection();
  const [createDashboard, { isLoading: isCreating }] =
    useCreateDashboardMutation();
  const [updateDashboard] = useUpdateDashboardMutation();

  const [selectedDashboardId, setSelectedDashboardId] =
    useState<DashboardId | null>(null);

  // Use the manually picked dashboard, or fall back to the last x-ray dashboard
  const effectiveDashboardId =
    selectedDashboardId ?? (lastDashboard ? lastDashboard.id : null);

  const handleMoveDashboard = useCallback(async () => {
    if (!effectiveDashboardId || !sharedCollectionId) {
      return;
    }

    try {
      await moveDashboard(Number(effectiveDashboardId), sharedCollectionId);
      onCompleted();
    } catch (error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: getErrorMessage(
          error,
          t`Failed to move dashboard to the shared collection`,
        ),
      });
    }
  }, [
    effectiveDashboardId,
    sharedCollectionId,
    moveDashboard,
    sendToast,
    onCompleted,
  ]);

  const handleCreateSampleDashboard = useCallback(async () => {
    if (!sharedCollectionId) {
      return;
    }

    try {
      const dashboard = await createDashboard({
        name: t`Sample dashboard`,
        collection_id: sharedCollectionId,
      }).unwrap();

      await updateDashboard({
        id: dashboard.id,
        dashcards: [
          {
            id: -1,
            card_id: null,
            row: 0,
            col: 0,
            size_x: 18,
            size_y: 2,
            visualization_settings: {
              virtual_card: {
                name: null,
                display: "text",
                visualization_settings: {},
                archived: false,
              },
              text: "Hello, world!",
            },
          } as any,
        ],
      }).unwrap();

      dispatch(Api.util.invalidateTags([listTag("embedding-hub-checklist")]));
      onCompleted();
    } catch (error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: getErrorMessage(error, t`Failed to create a sample dashboard`),
      });
    }
  }, [
    sharedCollectionId,
    createDashboard,
    updateDashboard,
    dispatch,
    sendToast,
    onCompleted,
  ]);

  if (sharedCollectionHasDashboards) {
    return (
      <Stack gap="md">
        <Text size="md" c="text-secondary" lh="lg">
          {t`The shared collection already has dashboards.`}
        </Text>
        <Group justify="flex-end">
          <Button variant="filled" onClick={onCompleted}>
            {t`Continue`}
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text size="md" c="text-secondary" lh="lg">
        {t`This will allow tenant users to see it.`}
      </Text>

      <Group gap="sm" align="center">
        <Box flex="1">
          <DashboardSelector
            value={effectiveDashboardId ?? undefined}
            onChange={(id) => setSelectedDashboardId(id ?? null)}
          />
        </Box>
        <Button
          variant="filled"
          onClick={handleMoveDashboard}
          loading={isMoving}
          disabled={!effectiveDashboardId}
        >
          {t`Move to shared collection`}
        </Button>
      </Group>

      <Divider label={t`or`} />

      <Group justify="center">
        <Button
          variant="filled"
          onClick={handleCreateSampleDashboard}
          loading={isCreating}
        >
          {t`Create a sample dashboard`}
        </Button>
      </Group>
    </Stack>
  );
};
