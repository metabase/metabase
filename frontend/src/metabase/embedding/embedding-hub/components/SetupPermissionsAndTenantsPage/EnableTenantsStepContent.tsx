/* eslint-disable metabase/no-literal-metabase-strings -- This string only shows for admins */

import { useCallback } from "react";
import { t } from "ttag";

import {
  useCreateCollectionMutation,
  useListCollectionsTreeQuery,
  useUpdateSettingMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { Button, Group, Stack, Text } from "metabase/ui";

import S from "./SetupPermissionsAndTenantsPage.module.css";

interface EnableTenantsStepContentProps {
  isTenantsEnabled: boolean;
}

export const EnableTenantsStepContent = ({
  isTenantsEnabled,
}: EnableTenantsStepContentProps) => {
  const [sendToast] = useToast();

  const { data: sharedTenantCollections } = useListCollectionsTreeQuery({
    namespace: "shared-tenant-collection",
  });

  const [updateSetting, { isLoading: isUpdatingSetting }] =
    useUpdateSettingMutation();

  const [createCollection, { isLoading: isCreatingCollection }] =
    useCreateCollectionMutation();

  const hasSharedCollections =
    sharedTenantCollections && sharedTenantCollections.length > 0;

  const isEnablingTenants = isUpdatingSetting || isCreatingCollection;

  const enableTenantsAndCreateSharedCollection = useCallback(async () => {
    try {
      await updateSetting({ key: "use-tenants", value: true }).unwrap();

      // Only create a shared collection if none exist yet
      if (!hasSharedCollections) {
        await createCollection({
          name: t`Shared collection`,
          parent_id: null,
          namespace: "shared-tenant-collection",
        }).unwrap();
      }
    } catch (error) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: getErrorMessage(
          error,
          t`Failed to enable tenants and create shared collection`,
        ),
      });
    }
  }, [updateSetting, hasSharedCollections, createCollection, sendToast]);

  return (
    <Stack gap="lg">
      <img
        src="app/assets/img/embedding-onboarding/multi-tenant-user-strategy.svg"
        alt=""
        className={S.illustration}
      />

      <Text size="md" c="text-secondary" lh="lg">
        {t`A tenant is a set of attributes assigned to a user to isolate them from other tenants. For example, in a SaaS app with embedded Metabase dashboards, you can assign each customer to a tenant.`}
      </Text>

      <Text size="md" c="text-secondary" lh="lg">
        {t`The main benefit of tenants is that you can reuse the same dashboards and permissions across all tenants, instead of recreating them for each customer, while ensuring each tenant only sees its own data. A shared collection will be created to hold dashboards and charts that are shared between all tenants.`}
      </Text>

      <Group justify="flex-end">
        <Button
          variant="filled"
          onClick={enableTenantsAndCreateSharedCollection}
          loading={isEnablingTenants}
          disabled={isTenantsEnabled && hasSharedCollections}
        >
          {t`Enable tenants and create shared collection`}
        </Button>
      </Group>
    </Stack>
  );
};
