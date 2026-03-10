import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  useListCollectionItemsQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { DashboardPickerModal } from "metabase/common/components/Pickers";
import type { OmniPickerItem } from "metabase/common/components/Pickers/EntityPicker";
import { useToast } from "metabase/common/hooks";
import { Button, Group, Stack, Text } from "metabase/ui";

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

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedDashboard, setSelectedDashboard] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // Use the manually picked dashboard, or fall back to the last x-ray dashboard
  const effectiveDashboard = selectedDashboard ?? lastDashboard;

  const handleDashboardSelected = useCallback((item: OmniPickerItem) => {
    setSelectedDashboard({ id: Number(item.id), name: item.name });
    setIsPickerOpen(false);
  }, []);

  const handleMoveDashboard = useCallback(async () => {
    if (!effectiveDashboard || !sharedCollectionId) {
      return;
    }

    try {
      await moveDashboard(effectiveDashboard.id, sharedCollectionId);
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
    effectiveDashboard,
    sharedCollectionId,
    moveDashboard,
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
        {t`Move a dashboard to the shared collection so tenant users can see it.`}
      </Text>

      <Group gap="sm">
        <Button variant="default" onClick={() => setIsPickerOpen(true)}>
          {effectiveDashboard ? effectiveDashboard.name : t`Choose a dashboard`}
        </Button>
      </Group>

      <Group justify="flex-end">
        <Button variant="subtle" onClick={onCompleted}>
          {t`Skip`}
        </Button>
        <Button
          variant="filled"
          onClick={handleMoveDashboard}
          loading={isMoving}
          disabled={!effectiveDashboard}
        >
          {t`Move to shared collection`}
        </Button>
      </Group>

      {isPickerOpen && (
        <DashboardPickerModal
          title={t`Choose a dashboard`}
          onChange={handleDashboardSelected}
          onClose={() => setIsPickerOpen(false)}
          value={
            effectiveDashboard
              ? { id: effectiveDashboard.id, model: "dashboard" }
              : { id: "root", model: "collection" }
          }
          options={{
            hasConfirmButtons: false,
            canCreateDashboards: false,
          }}
        />
      )}
    </Stack>
  );
};
