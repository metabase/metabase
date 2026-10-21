import { useCallback, useState } from "react";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { AddToDashSelectDashModal } from "metabase/common/components/Pickers/AddToDashSelectDashModal";
import { SaveQuestionModal } from "metabase/common/components/SaveQuestionModal";
import { DND_IGNORE_CLASS_NAME } from "metabase/common/components/dnd";
import { useNavigate } from "metabase/router";
import { Group, Stack } from "metabase/ui";
import type { Card, ConcreteTableId } from "metabase-types/api";

import { pickSettingsForKind } from "../analyses/config";
import type { AnalysisSettingsByKind } from "../analyses/types";
import { buildAnalysisCard } from "../analysis-card";
import { useDrillActions } from "../drills/use-drill-actions";
import { useDrillQueries } from "../drills/use-drill-queries";
import { type AnalysisFilters, withPeopleFilter } from "../filters";
import { SegmentDragProvider } from "../segments/drag-context";
import type { PaletteSegment } from "../segments/types";
import type { StoredSettings } from "../settings/types";
import type { AnalysisKind } from "../spec/types";
import { grainLabel } from "../sql/compile/grain";
import type { DrillPoint } from "../sql/compose";
import { useSupportingAnalyses } from "../supporting/use-supporting-analyses";
import { useAddToDashboardToast } from "../use-add-to-dashboard-toast";
import { useAnalysis } from "../use-analysis";
import { type HintedPanel, useAnalysisState } from "../use-analysis-state";
import { useSaveAnalysis } from "../use-save-analysis";

import { AnalysisResult } from "./AnalysisResult";
import { AnalysisTitle, getNewAnalysisTitle } from "./AnalysisTitle";
import { AnalysisToolbar } from "./AnalysisToolbar";
import { FilterPills, useFilterCount } from "./FilterPills";
import { SetupPanel } from "./SetupPanel";
import { CreateSegmentModal } from "./drills/CreateSegmentModal";
import { MembersModal } from "./drills/MembersModal";
import { SegmentsPanel } from "./palette/SegmentsPanel";
import { InsightsPanel } from "./supporting/InsightsPanel";
import { InsightsToggleContext } from "./supporting/InsightsToggle";
import { SupportingAnalyses } from "./supporting/SupportingAnalyses";

type AnalysisWorkspaceProps<K extends AnalysisKind> = {
  kind: K;
  tableId: ConcreteTableId | undefined;
  savedCard?: Card;
  savedSettings?: StoredSettings;
  /** For a new analysis, where the setup panel picks the table. */
  onTableChange?: (tableId: ConcreteTableId) => void;
};

/**
 * The event analysis page: the title and toolbar across the top, then the
 * setup panel (with the segments attached to its right) and the result side
 * by side. A new analysis shows only the setup panel's table picker until a
 * table is picked. The result's column scrolls, with the kind's supporting
 * analyses below the primary chart. Each chart's insights button opens the
 * insights in a side panel on the right. A saved analysis opens on its
 * result, with the side panels collapsed.
 */
export const AnalysisWorkspace = <K extends AnalysisKind>({
  kind,
  tableId,
  savedCard,
  savedSettings,
  onTableChange,
}: AnalysisWorkspaceProps<K>) => {
  const navigate = useNavigate();
  const [isSegmentsOpen, setIsSegmentsOpen] = useState(false);
  // The panel whose toolbar button is hovered lights up its border.
  const [hintedPanel, setHintedPanel] = useState<HintedPanel | null>(null);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const openInsights = useCallback(() => setIsInsightsOpen(true), []);
  // Like the query builder: a new analysis shows its filters, a saved one
  // starts with them collapsed behind the Filter button's badge.
  const [areFiltersExpanded, setAreFiltersExpanded] = useState(
    savedCard === undefined,
  );
  const {
    stored,
    hasUnsavedChanges,
    panel,
    setPanel,
    onChangeSettings,
    onSaved,
  } = useAnalysisState<AnalysisSettingsByKind[K]>(savedSettings);
  // Without a table, the setup panel is where it gets picked.
  const isSetupOpen = panel !== null || tableId === undefined;
  const {
    config,
    table,
    usersTable,
    context,
    computed,
    base,
    spec,
    widgets,
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
  const filterCount = useFilterCount(computed.filters, table);
  const supporting = useSupportingAnalyses({
    spec,
    tableId,
    base,
    context,
    onShowInsights: openInsights,
  });
  const insights = supporting.insights;
  const drillQueries = useDrillQueries({
    spec,
    compiledBase: query.compiledBase,
    table,
    usersTable,
    settings: computed,
  });
  const describePoint = useCallback(
    (point: DrillPoint) => config.describePoint?.(computed, point) ?? null,
    [config, computed],
  );
  const drillActions = useDrillActions({
    tableId,
    stored,
    settings: computed,
    countColumn: grainLabel(computed.counting),
    describePoint,
    queries: drillQueries,
    getExtraActions: supporting.getClickActions,
  });

  const tableName = table?.display_name ?? t`this table`;
  const title = savedCard?.name ?? getNewAnalysisTitle(kind, tableName);

  // Only the kind on the current tab is saved; the other tabs' settings stay
  // in the URL for this session.
  const analysisCard =
    tableId !== undefined && query.datasetQuery !== undefined
      ? buildAnalysisCard({
          name: title,
          kind,
          tableId,
          stored: pickSettingsForKind(kind, stored),
          display,
          vizSettings,
          datasetQuery: query.datasetQuery,
        })
      : undefined;
  const {
    canSave,
    isSaveDisabled,
    canRename,
    saveModal,
    handleSave,
    handleCreate,
    handleReplace,
    handleRename,
    handleCloseSaveModal,
    isLocationAllowed,
  } = useSaveAnalysis({
    savedCard,
    card: analysisCard,
    hasUnsavedChanges,
    onSaved,
  });
  const { isPickerOpen, closePicker } = useAddToDashboardToast();

  const handleFiltersChange = (filters: AnalysisFilters) =>
    widgets.find((widget) => widget.id === "filters")?.onChange(filters);
  const handleAddPeopleFilter = (segment: PaletteSegment) =>
    handleFiltersChange(withPeopleFilter(computed.filters, segment));

  return (
    <SegmentDragProvider
      isPaletteOpen={isSetupOpen && isSegmentsOpen}
      onPeopleSegment={handleAddPeopleFilter}
    >
      {/* Keeps the app-wide react-dnd backend out of the palette's native drags. */}
      <Stack
        className={DND_IGNORE_CLASS_NAME}
        flex={1}
        h="100%"
        gap={0}
        bg="background-secondary"
      >
        <Stack
          gap="md"
          pl="xxl"
          pr="lg"
          pt="lg"
          pb="md"
          bg="background-primary"
          style={{ borderBottom: "1px solid var(--mb-color-border)" }}
        >
          <AnalysisTitle
            kind={kind}
            tableName={tableName}
            savedName={savedCard?.name}
            onRename={canRename ? handleRename : undefined}
          />
          <AnalysisToolbar
            widgets={widgets}
            setupLabel={config.setupLabel}
            sql={query.sql}
            canSave={canSave}
            isSaveDisabled={isSaveDisabled}
            isSetupOpen={isSetupOpen}
            onToggleSetup={() => setPanel(isSetupOpen ? null : "setup")}
            onHintPanel={setHintedPanel}
            onSave={handleSave}
            filterCount={filterCount}
            areFiltersExpanded={areFiltersExpanded}
            onToggleFilters={() => setAreFiltersExpanded((isOpen) => !isOpen)}
          />
          {areFiltersExpanded && (
            <FilterPills
              value={computed.filters}
              table={table}
              onChange={handleFiltersChange}
            />
          )}
        </Stack>
        <Group
          gap="lg"
          wrap="nowrap"
          py="lg"
          pl="xxl"
          flex={1}
          align="stretch"
          mih={0}
        >
          {isSetupOpen && (
            <SetupPanel
              key={kind}
              tableId={tableId}
              table={table}
              onTableChange={
                onTableChange &&
                ((id) => {
                  // Picking the first table keeps the setup showing, even if
                  // its toolbar button was toggled off while there was none.
                  if (tableId === undefined && panel === null) {
                    setPanel("setup");
                  }
                  onTableChange(id);
                })
              }
              tab={panel ?? "setup"}
              onTabChange={setPanel}
              setupLabel={config.setupLabel}
              widgets={widgets}
              isSegmentsOpen={isSegmentsOpen}
              onToggleSegments={() => setIsSegmentsOpen((isOpen) => !isOpen)}
              segments={
                <SegmentsPanel
                  table={table}
                  usersTable={usersTable}
                  onSelectPeopleSegment={handleAddPeopleFilter}
                />
              }
              isHinted={hintedPanel === "setup"}
            />
          )}
          {tableId !== undefined && (
            <InsightsToggleContext.Provider
              value={{
                isOpen: isInsightsOpen,
                onToggle: () => setIsInsightsOpen((isOpen) => !isOpen),
                onHint: (isHinted) =>
                  setHintedPanel(isHinted ? "insights" : null),
              }}
            >
              <Stack
                flex={1}
                miw={0}
                gap="lg"
                pr={isInsightsOpen ? 0 : "lg"}
                style={{ overflowY: "auto" }}
              >
                <AnalysisResult
                  title={config.question}
                  display={display}
                  vizSettings={vizSettings}
                  dataset={query.dataset}
                  datasetQuery={query.datasetQuery}
                  isLoading={query.isLoading}
                  error={query.error}
                  missing={missing}
                  setupLabel={config.setupLabel}
                  onOpenSetup={
                    panel !== "setup" ? () => setPanel("setup") : undefined
                  }
                  clickActionsMode={drillActions.mode}
                />
                <SupportingAnalyses supporting={supporting} />
              </Stack>
            </InsightsToggleContext.Provider>
          )}
          {tableId !== undefined && isInsightsOpen && (
            <InsightsPanel
              insights={insights.insights}
              focus={insights.focus}
              idleLabel={insights.idleLabel}
              isHinted={hintedPanel === "insights"}
              onClose={() => setIsInsightsOpen(false)}
            />
          )}
        </Group>
      </Stack>
      {saveModal !== undefined && (
        <SaveQuestionModal
          opened
          question={saveModal.question}
          originalQuestion={saveModal.originalQuestion}
          onCreate={handleCreate}
          onSave={handleReplace}
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
      {drillActions.modal?.type === "members" && (
        <MembersModal
          drill={drillActions.modal.drill}
          queries={drillQueries}
          onClose={drillActions.closeModal}
        />
      )}
      {drillActions.modal?.type === "segment" && (
        <CreateSegmentModal
          drill={drillActions.modal.drill}
          settings={computed}
          table={table}
          queries={drillQueries}
          toCohort={drillActions.toCohort}
          onClose={drillActions.closeModal}
        />
      )}
      <LeaveRouteConfirmModal
        isEnabled={hasUnsavedChanges}
        isLocationAllowed={() =>
          isLocationAllowed() || drillActions.isDrilling()
        }
      />
    </SegmentDragProvider>
  );
};
