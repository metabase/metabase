import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useGetEmbeddingHubChecklistQuery } from "metabase/api/embedding-hub";
import { OnboardingStepper } from "metabase/common/components/OnboardingStepper";
import type { OnboardingStepperHandle } from "metabase/common/components/OnboardingStepper/types";
import {
  type CreatedTenantData,
  PLUGIN_TENANTS,
} from "metabase/plugins/oss/tenants";
import { Group, Icon, Stack, Text, Title } from "metabase/ui";

import {
  type DataSegregationStrategy,
  DataSegregationStrategyPicker,
} from "./DataSegregationStrategyPicker";
import { DatabaseRoutingStepContent } from "./DatabaseRoutingStepContent";
import { EnableTenantsStepContent } from "./EnableTenantsStepContent";
import { RlsDataSelector } from "./RlsDataSelector";
import S from "./SetupPermissionsAndTenantsPage.module.css";

const SETUP_GUIDE_PATH = "/admin/embedding/setup-guide";

export const SetupPermissionsAndTenantsPage = () => {
  const stepperRef = useRef<OnboardingStepperHandle>(null);
  const { data: checklist } = useGetEmbeddingHubChecklistQuery();

  // The "Which data segregation strategy does your database use?"
  // is a purely UI step for choosing which strategy to use.
  const [selectedStrategy, setSelectedStrategy] =
    useState<DataSegregationStrategy | null>(null);

  const [isStrategyConfirmed, setIsStrategyConfirmed] = useState(false);

  // Track the tenants created in this onboarding flow
  const [createdTenants, setCreatedTenants] = useState<CreatedTenantData[]>([]);

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
      // Even if the data strategy step was completed before,
      // UI needs to know which strategy to re-configure.
      "select-data": !isStrategyConfirmed,
      "create-tenants": !isPickDataStrategyDone,
      summary: !(
        isTenantsEnabled &&
        isPickDataStrategyDone &&
        isDataSegregationSetupDone &&
        isTenantsCreated
      ),
    };
  }, [
    isStrategyConfirmed,
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
          <EnableTenantsStepContent isTenantsEnabled={isTenantsEnabled} />
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
          // Database routing step links to documentation
          hideTitleOnActive={selectedStrategy === "database-routing"}
        >
          {match(selectedStrategy)
            .with("row-column-level-security", () => (
              <RlsDataSelector
                onSuccess={() => {
                  // User might had already created tenants before,
                  // so we allow jumping straight to the summary flow.
                  stepperRef.current?.goToNextIncompleteStep();
                }}
              />
            ))
            .with("database-routing", () => <DatabaseRoutingStepContent />)
            // TODO(EMB-1271): implement connection impersonation onboarding
            .with("connection-impersonation", () => null)
            .otherwise(() => null)}
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
