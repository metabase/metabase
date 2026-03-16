import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  useListCollectionItemsQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { DashboardSelector } from "metabase/common/components/DashboardSelector";
import { useToast } from "metabase/common/hooks";
import { Box, Button, Divider, Group, Stack, Text } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

import {
  useCreateSampleDashboardInSharedCollection,
  useLastXrayDashboard,
  useMoveXrayDashboardToSharedCollection,
} from "./hooks/use-xray-dashboards";

interface MoveDashboardStepContentProps {
  onCompleted: () => void;
}

export const MoveDashboardStepContent = ({
  onCompleted,
}: MoveDashboardStepContentProps) => {
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

  const { lastDashboard, isLoading: isLoadingXray } = useLastXrayDashboard();
  const { moveDashboard, isMoving } = useMoveXrayDashboardToSharedCollection();
  const { createSampleDashboard, isCreating } =
    useCreateSampleDashboardInSharedCollection();

  const [selectedDashboardId, setSelectedDashboardId] =
    useState<DashboardId | null>(null);

  // Use the manually picked dashboard, or fall back to the last x-ray dashboard
  const effectiveDashboardId =
    selectedDashboardId ?? (lastDashboard ? lastDashboard.id : null);

  const hasXrayDashboard = !isLoadingXray && lastDashboard != null;

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
      await createSampleDashboard(sharedCollectionId);
      onCompleted();
    } catch (error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: getErrorMessage(error, t`Failed to create a sample dashboard`),
      });
    }
  }, [sharedCollectionId, createSampleDashboard, sendToast, onCompleted]);

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

  if (!hasXrayDashboard) {
    return (
      <Stack gap="md">
        <Text size="md" c="text-secondary" lh="lg">
          {t`This will allow tenant users to see it.`}
        </Text>

        <Group justify="flex-end">
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
          variant="default"
          onClick={handleCreateSampleDashboard}
          loading={isCreating}
        >
          {t`Create a sample dashboard`}
        </Button>
      </Group>
    </Stack>
  );
};
