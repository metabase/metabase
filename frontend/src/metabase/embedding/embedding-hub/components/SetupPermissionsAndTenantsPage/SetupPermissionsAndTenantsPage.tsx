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

import { ConnectionImpersonationStepContent } from "./ConnectionImpersonationStepContent";
import {
  type DataSegregationStrategy,
  DataSegregationStrategyPicker,
} from "./DataSegregationStrategyPicker";
import { DatabaseRoutingStepContent } from "./DatabaseRoutingStepContent";
import { EnableTenantsStepContent } from "./EnableTenantsStepContent";
import { MoveDashboardStepContent } from "./MoveDashboardStepContent";
import type {
  RlsSelectionResult,
  TableColumnSelection,
} from "./RlsDataSelector";
import {
  RlsDataSelector,
  createEmptyTableColumnSelection,
} from "./RlsDataSelector";
import S from "./SetupPermissionsAndTenantsPage.module.css";
import { useLastXrayDashboard } from "./hooks/use-xray-dashboards";
import { createEmptyTenantDraft } from "./utils";
const SETUP_GUIDE_PATH = "/admin/embedding/setup-guide";

export const SetupPermissionsAndTenantsPage = () => {
  const stepperRef = useRef<OnboardingStepperHandle>(null);

  const { data: checklistResponse } = useGetEmbeddingHubChecklistQuery();
  const checklist = checklistResponse?.checklist;

  // The "Which data segregation strategy does your database use?"
  // is a purely UI step for choosing which strategy to use.
  const [selectedStrategy, setSelectedStrategy] =
    useState<DataSegregationStrategy | null>(null);

  const [isStrategyConfirmed, setIsStrategyConfirmed] = useState(false);

  // Track the tenants created in this onboarding flow
  const [createdTenants, setCreatedTenants] = useState<CreatedTenantData[]>([]);
  const [needsTenantRecreation, setNeedsTenantRecreation] = useState(false);

  const [tenantDrafts, setTenantDrafts] = useState<CreatedTenantData[]>(() => [
    createEmptyTenantDraft(1),
  ]);

  // Track RLS selection from the "Select data" step (in-session only)
  const [rlsSelection, setRlsSelection] = useState<RlsSelectionResult>(
    createEmptyRlsSelection,
  );

  const [rlsSelectionsDraft, setRlsSelectionsDraft] = useState<
    TableColumnSelection[]
  >(() => [createEmptyTableColumnSelection()]);

  const isMoveDashboardDone = checklist?.["move-dashboard-to-shared"] ?? false;

  const { lastDashboard, isLoading: isLoadingXray } = useLastXrayDashboard();
  const hasXrayDashboard = !isLoadingXray && lastDashboard != null;

  // Prefer in-session UI state; fall back to backend detection for reloads
  const activeStrategy =
    selectedStrategy ?? checklistResponse?.["data-isolation-strategy"] ?? null;

  const isTenantsEnabled = checklist?.["enable-tenants"] ?? false;

  const isDataSegregationSetupDone =
    checklist?.["setup-data-segregation-strategy"] ?? false;

  const backendStrategy =
    checklistResponse?.["data-isolation-strategy"] ?? null;
  const isTenantsCreatedFromBackend = checklist?.["create-tenants"] ?? false;
  const isTenantsCreated =
    !needsTenantRecreation &&
    (createdTenants.length > 0 ||
      (isTenantsCreatedFromBackend && activeStrategy === backendStrategy));

  // When data segregation is finally configured, we permanently
  // mark this step as done. Otherwise rely on UI state.
  const isPickDataStrategyDone =
    isStrategyConfirmed || isDataSegregationSetupDone;

  const completedSteps = useMemo(() => {
    return {
      "enable-tenants": isTenantsEnabled,
      "move-dashboard": isMoveDashboardDone,
      "data-segregation": isPickDataStrategyDone,
      "select-data": isDataSegregationSetupDone,
      "create-tenants": isTenantsCreated,

      summary:
        isTenantsEnabled && isDataSegregationSetupDone && isTenantsCreated,
    };
  }, [
    isTenantsEnabled,
    isMoveDashboardDone,
    isPickDataStrategyDone,
    isDataSegregationSetupDone,
    isTenantsCreated,
  ]);

  const lockedSteps = useMemo(() => {
    return {
      // The shared tenant collection is created when tenants are enabled,
      // so the move-dashboard step can't work until that's done.
      "move-dashboard": !isTenantsEnabled,
      // Unlock once we know the strategy — either from in-session confirmation
      // or from the backend on reload.
      "select-data": activeStrategy === null,
      "create-tenants": !isPickDataStrategyDone,
      summary: !(
        isTenantsEnabled &&
        isPickDataStrategyDone &&
        isDataSegregationSetupDone &&
        isTenantsCreated
      ),
    };
  }, [
    activeStrategy,
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
          stepId="move-dashboard"
          title={
            hasXrayDashboard
              ? t`Move a dashboard to the shared collection`
              : t`Create a dashboard in the shared collection`
          }
        >
          <MoveDashboardStepContent
            isMoveDashboardDone={isMoveDashboardDone}
            hasXrayDashboard={hasXrayDashboard}
            lastDashboard={lastDashboard}
            onCompleted={() => stepperRef.current?.goToNextStep()}
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="data-segregation"
          title={t`Which data segregation strategy does your database use?`}
        >
          <DataSegregationStrategyPicker
            value={activeStrategy}
            onChange={(value) => {
              const hasStrategyChanged = value !== activeStrategy;

              setSelectedStrategy(value);
              setIsStrategyConfirmed(false);

              if (hasStrategyChanged) {
                setCreatedTenants([]);
                setTenantDrafts([createEmptyTenantDraft(1)]);
                setRlsSelection(createEmptyRlsSelection());
                setRlsSelectionsDraft([createEmptyTableColumnSelection()]);
              }
            }}
            onConfirm={() => {
              const confirmedStrategy = activeStrategy;
              const shouldRecreateTenants =
                confirmedStrategy !== backendStrategy;

              setIsStrategyConfirmed(true);
              setNeedsTenantRecreation(shouldRecreateTenants);

              if (shouldRecreateTenants) {
                setCreatedTenants([]);
              }

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
          hideTitleOnActive={activeStrategy === "database-routing"}
        >
          {match(activeStrategy)
            .with("row-column-level-security", () => (
              <RlsDataSelector
                selections={rlsSelectionsDraft}
                onSelectionsChange={setRlsSelectionsDraft}
                onSuccess={(result) => {
                  setRlsSelection(result);

                  // User might had already created tenants before,
                  // so we allow jumping straight to the summary flow.
                  stepperRef.current?.goToNextIncompleteStep();
                }}
              />
            ))
            .with("database-routing", () => <DatabaseRoutingStepContent />)
            .with("connection-impersonation", () => (
              <ConnectionImpersonationStepContent
                onNext={() => stepperRef.current?.goToNextIncompleteStep()}
              />
            ))
            .otherwise(() => null)}
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="create-tenants"
          title={t`Create tenants`}
        >
          <PLUGIN_TENANTS.CreateTenantsOnboardingStep
            onTenantsCreated={(tenants) => {
              setCreatedTenants(tenants);
              setNeedsTenantRecreation(false);
              setTenantDrafts([createEmptyTenantDraft(1)]);
            }}
            tenants={tenantDrafts}
            onTenantsChange={setTenantDrafts}
            selectedFieldIds={rlsSelection.fieldIds}
            strategy={activeStrategy}
            rlsColumnName={rlsSelection.columnName}
          />
        </OnboardingStepper.Step>

        <OnboardingStepper.Step
          stepId="summary"
          title={t`Summary`}
          hideTitleOnActive
        >
          <PLUGIN_TENANTS.TenantsSummaryOnboardingStep
            tenants={createdTenants}
            strategy={activeStrategy}
            rlsTableNames={rlsSelection.tableNames}
            rlsColumnName={rlsSelection.columnName}
          />
        </OnboardingStepper.Step>
      </OnboardingStepper>
    </Stack>
  );
};

const createEmptyRlsSelection = (): RlsSelectionResult => ({
  fieldIds: [],
  tableNames: [],
  columnName: null,
});
