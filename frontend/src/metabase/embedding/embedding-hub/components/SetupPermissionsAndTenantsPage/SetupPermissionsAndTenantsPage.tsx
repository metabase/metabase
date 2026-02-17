/* eslint-disable metabase/no-literal-metabase-strings -- This string only shows for admins */

import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  useCreateCollectionMutation,
  useListCollectionsTreeQuery,
  useUpdateSettingsMutation,
} from "metabase/api";
import { useGetEmbeddingHubChecklistQuery } from "metabase/api/embedding-hub";
import { getErrorMessage } from "metabase/api/utils";
import { OnboardingStepper } from "metabase/common/components/OnboardingStepper";
import type { OnboardingStepperHandle } from "metabase/common/components/OnboardingStepper/types";
import { useToast } from "metabase/common/hooks";
import {
  type CreatedTenantData,
  PLUGIN_TENANTS,
} from "metabase/plugins/oss/tenants";
import { Button, Group, Icon, Stack, Text, Title } from "metabase/ui";

import {
  type DataSegregationStrategy,
  DataSegregationStrategyPicker,
} from "./DataSegregationStrategyPicker";
import { DatabaseRoutingStepContent } from "./DatabaseRoutingStepContent";
import S from "./SetupPermissionsAndTenantsPage.module.css";

const SETUP_GUIDE_PATH = "/admin/embedding/setup-guide";

export const SetupPermissionsAndTenantsPage = () => {
  const stepperRef = useRef<OnboardingStepperHandle>(null);
  const [sendToast] = useToast();
  const { data: checklist } = useGetEmbeddingHubChecklistQuery();

  const { data: sharedTenantCollections } = useListCollectionsTreeQuery({
    namespace: "shared-tenant-collection",
  });

  const [updateSettings, { isLoading: isUpdatingSettings }] =
    useUpdateSettingsMutation();

  const [createCollection, { isLoading: isCreatingCollection }] =
    useCreateCollectionMutation();

  // The "Which data segregation strategy does your database use?"
  // is a purely UI step for choosing which strategy to use.
  const [selectedStrategy, setSelectedStrategy] =
    useState<DataSegregationStrategy | null>(null);

  const [isStrategyConfirmed, setIsStrategyConfirmed] = useState(false);

  // Track the tenants created in this onboarding flow
  const [createdTenants, setCreatedTenants] = useState<CreatedTenantData[]>([]);

  const hasSharedCollections =
    sharedTenantCollections && sharedTenantCollections.length > 0;

  const handleEnableTenantsAndCreateSharedCollection = useCallback(async () => {
    try {
      await updateSettings({ "use-tenants": true }).unwrap();

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
  }, [updateSettings, hasSharedCollections, createCollection, sendToast]);

  const isEnablingTenants = isUpdatingSettings || isCreatingCollection;

  const isTenantsEnabled = checklist?.["enable-tenants"] ?? false;

  const isDataSegregationSetupDone =
    checklist?.["setup-data-segregation-strategy"] ?? false;

  const isTenantsCreated = checklist?.["create-tenants"] ?? false;

  // When data segregation is finally configured, we permanently
  // mark this step as done. Otherwise rely on UI state.
  const isPickDataStrategyDone =
    isStrategyConfirmed || isDataSegregationSetupDone;

  const completedSteps = useMemo(() => {
    return {
      "enable-tenants": isTenantsEnabled,
      "data-segregation": isPickDataStrategyDone,
      "select-data": isDataSegregationSetupDone,
      "create-tenants": isTenantsCreated,

      summary:
        isTenantsEnabled && isDataSegregationSetupDone && isTenantsCreated,
    };
  }, [
    isTenantsEnabled,
    isPickDataStrategyDone,
    isDataSegregationSetupDone,
    isTenantsCreated,
  ]);

  const lockedSteps = useMemo(() => {
    return {
      "select-data": !isPickDataStrategyDone,
      "create-tenants": !isPickDataStrategyDone,
      summary: !(
        isTenantsEnabled &&
        isPickDataStrategyDone &&
        isDataSegregationSetupDone &&
        isTenantsCreated
      ),
    };
  }, [
    isPickDataStrategyDone,
    isTenantsEnabled,
    isDataSegregationSetupDone,
    isTenantsCreated,
  ]);

  return (
    <Stack mx="auto" gap="sm" maw={680}>
      <Link to={SETUP_GUIDE_PATH} className={S.backLink}>
        <Group gap="xs">
          <Icon name="chevronleft" size={12} />
          <Text size="sm" c="text-secondary">{t`Back to the setup guide`}</Text>
        </Group>
      </Link>

      <Title order={1} c="text-primary" mb="xl">
        {t`Configure data permissions and enable tenants`}
      </Title>

      <OnboardingStepper
        ref={stepperRef}
        completedSteps={completedSteps}
        lockedSteps={lockedSteps}
      >
        <OnboardingStepper.Step
          stepId="enable-tenants"
          title={t`Enable multi-tenant user strategy`}
        >
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
                onClick={handleEnableTenantsAndCreateSharedCollection}
                loading={isEnablingTenants}
                disabled={isTenantsEnabled && hasSharedCollections}
              >
                {t`Enable tenants and create shared collection`}
              </Button>
            </Group>
          </Stack>
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="data-segregation"
          title={t`Which data segregation strategy does your database use?`}
        >
          <DataSegregationStrategyPicker
            value={selectedStrategy}
            onChange={(value) => {
              setSelectedStrategy(value);
              setIsStrategyConfirmed(false);
            }}
            onConfirm={() => {
              setIsStrategyConfirmed(true);

              // User is re-configuring the data segregation,
              // so we need to _always_ go to the next step.
              stepperRef.current?.goToNextStep();
            }}
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="select-data"
          title={t`Select data to make available`}
          hideTitleOnActive
        >
          {selectedStrategy === "database-routing" ? (
            <DatabaseRoutingStepContent />
          ) : (
            <Text c="text-secondary" size="sm" lh="lg">
              {t`Choose which tables and columns are available for embedding.`}
            </Text>
          )}
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="create-tenants"
          title={t`Create tenants`}
        >
          <PLUGIN_TENANTS.CreateTenantsOnboardingStep
            onTenantsCreated={setCreatedTenants}
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="summary"
          title={t`Summary`}
          hideTitleOnActive
        >
          <PLUGIN_TENANTS.TenantsSummaryOnboardingStep
            tenants={createdTenants}
          />
        </OnboardingStepper.Step>
      </OnboardingStepper>
    </Stack>
  );
};
