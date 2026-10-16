import { useState } from "react";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { AddToDashSelectDashModal } from "metabase/common/components/Pickers/AddToDashSelectDashModal";
import { SaveQuestionModal } from "metabase/common/components/SaveQuestionModal";
import { useNavigate } from "metabase/router";
import { Group, Stack, Title } from "metabase/ui";
import type { Card, ConcreteTableId } from "metabase-types/api";

import type { AnalysisSettingsByKind } from "../analyses/types";
import { buildAnalysisCard } from "../analysis-card";
import { getClickActionsMode } from "../click-actions-mode";
import {
  getFunnelPathsRange,
  getPathsFunnel,
  getPathsRangeInto,
} from "../funnel-paths/range";
import { useFunnelPaths } from "../funnel-paths/use-funnel-paths";
import {
  getClickedStep,
  getClickedTransition,
} from "../insights/clicked-transition";
import { useFunnelInsights } from "../insights/use-funnel-insights";
import type { StoredSettings } from "../settings/types";
import type { AnalysisKind } from "../spec/types";
import type { FunnelPathsRange } from "../sql/analyses/funnel-paths";
import { useAddToDashboardToast } from "../use-add-to-dashboard-toast";
import { useAnalysis } from "../use-analysis";
import { useAnalysisState } from "../use-analysis-state";
import { useSaveAnalysis } from "../use-save-analysis";

import { AnalysisResult } from "./AnalysisResult";
import { AnalysisToolbar } from "./AnalysisToolbar";
import { FunnelPathsPanel } from "./FunnelPathsPanel";
import { type InsightsFocus, InsightsPanel } from "./InsightsPanel";
import { SettingsPanel } from "./SettingsPanel";

type AnalysisWorkspaceProps<K extends AnalysisKind> = {
  kind: K;
  tableId: ConcreteTableId | undefined;
  savedCard?: Card;
  savedSettings?: StoredSettings;
};

export const AnalysisWorkspace = <K extends AnalysisKind>({
  kind,
  tableId,
  savedCard,
  savedSettings,
}: AnalysisWorkspaceProps<K>) => {
  const navigate = useNavigate();
  const {
    stored,
    hasUnsavedChanges,
    panel,
    setPanel,
    onChangeSettings,
    onSaved,
  } = useAnalysisState<AnalysisSettingsByKind[K]>(savedSettings);
  const {
    config,
    table,
    context,
    base,
    widgets,
    spec,
    missing,
    display,
    vizSettings,
    query,
  } = useAnalysis({
    kind,
    tableId,
    stored,
    onChangeSettings,
  });
  const insights = useFunnelInsights({ spec, tableId, base, context });
  const [insightsFocus, setInsightsFocus] = useState<InsightsFocus>();
  const pathsFunnel = getPathsFunnel(spec);
  const [chosenPathsRange, setChosenPathsRange] = useState<FunnelPathsRange>();
  const pathsRange =
    pathsFunnel !== undefined
      ? getFunnelPathsRange(pathsFunnel, chosenPathsRange)
      : undefined;
  const paths = useFunnelPaths({ spec, tableId, base, range: pathsRange });
  const [pathsFocusId, setPathsFocusId] = useState<number>();
  const clickActionsMode = getClickActionsMode({
    getInsightsTransition: (clicked) =>
      getClickedTransition(spec, insights.state, clicked),
    onShowInsights: (transition) =>
      setInsightsFocus((focus) => ({ transition, id: (focus?.id ?? 0) + 1 })),
    getPathsRange: (clicked) => {
      const step = getClickedStep(spec, clicked);
      return pathsFunnel !== undefined && step !== undefined
        ? getPathsRangeInto(pathsFunnel, step)
        : undefined;
    },
    onShowPaths: (range) => {
      setChosenPathsRange(range);
      setPathsFocusId((id) => (id ?? 0) + 1);
    },
  });

  const tableName = table?.display_name ?? t`this table`;
  const title = savedCard?.name ?? t`${config.name} analysis on ${tableName}`;

  const analysisCard =
    tableId !== undefined && query.datasetQuery !== undefined
      ? buildAnalysisCard({
          name: title,
          kind,
          tableId,
          stored,
          display,
          vizSettings,
          datasetQuery: query.datasetQuery,
        })
      : undefined;
  const {
    canSave,
    isSaveDisabled,
    questionToCreate,
    handleSave,
    handleCreate,
    handleCloseSaveModal,
    isLocationAllowed,
  } = useSaveAnalysis({
    savedCard,
    card: analysisCard,
    hasUnsavedChanges,
    onSaved,
  });
  const { isPickerOpen, closePicker } = useAddToDashboardToast();

  return (
    <Stack flex={1} h="100%" gap={0} bg="background-secondary">
      <Stack
        gap="md"
        pl="xxl"
        pr="lg"
        pt="lg"
        pb="md"
        bg="background-primary"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Title order={3} fw="normal">
          {title}
        </Title>
        <AnalysisToolbar
          widgets={widgets}
          panel={panel}
          setupLabel={config.setupLabel}
          sql={query.sql}
          canSave={canSave}
          isSaveDisabled={isSaveDisabled}
          onPanelChange={setPanel}
          onSave={handleSave}
        />
      </Stack>
      <Group
        gap="lg"
        wrap="nowrap"
        py="lg"
        pl="xxl"
        pr="lg"
        flex={1}
        align="stretch"
        mih={0}
      >
        {panel && <SettingsPanel panel={panel} widgets={widgets} />}
        <Stack flex={1} miw={0} gap="lg" style={{ overflowY: "auto" }}>
          <AnalysisResult
            title={config.question}
            display={display}
            vizSettings={vizSettings}
            dataset={query.dataset}
            datasetQuery={query.datasetQuery}
            isLoading={query.isLoading}
            error={
              query.error ??
              (tableId === undefined
                ? t`Choose a table to analyze.`
                : undefined)
            }
            warnings={query.warnings}
            missing={missing}
            setupLabel={config.setupLabel}
            clickActionsMode={clickActionsMode}
            onOpenSetup={
              panel !== "setup" ? () => setPanel("setup") : undefined
            }
          />
          {pathsFunnel !== undefined && pathsRange !== undefined && (
            <FunnelPathsPanel
              steps={pathsFunnel.steps}
              range={pathsRange}
              paths={paths}
              focusId={pathsFocusId}
              onChangeRange={setChosenPathsRange}
            />
          )}
          {kind === "funnel" && (
            <InsightsPanel insights={insights} focus={insightsFocus} />
          )}
        </Stack>
      </Group>
      {questionToCreate !== undefined && (
        <SaveQuestionModal
          opened
          question={questionToCreate}
          originalQuestion={null}
          onCreate={handleCreate}
          onSave={async () => undefined}
          onClose={handleCloseSaveModal}
          closeOnSuccess
        />
      )}
      {savedCard !== undefined && isPickerOpen && (
        <AddToDashSelectDashModal
          card={savedCard}
          onClose={closePicker}
          onChangeLocation={navigate}
        />
      )}
      <LeaveRouteConfirmModal
        isEnabled={hasUnsavedChanges}
        isLocationAllowed={isLocationAllowed}
      />
    </Stack>
  );
};
