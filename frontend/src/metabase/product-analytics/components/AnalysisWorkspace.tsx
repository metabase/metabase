import { useCallback, useState } from "react";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { AddToDashSelectDashModal } from "metabase/common/components/Pickers/AddToDashSelectDashModal";
import { SaveQuestionModal } from "metabase/common/components/SaveQuestionModal";
import { DND_IGNORE_CLASS_NAME } from "metabase/common/components/dnd";
import { useNavigate } from "metabase/router";
import { Group, Stack } from "metabase/ui";
import type {
  Card,
  ConcreteTableId,
  VisualizationSettings,
} from "metabase-types/api";

import { pickSettingsForKind } from "../analyses/config";
import type { AnalysisSettingsByKind, DisplayColors } from "../analyses/types";
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
import { useAddToDashboardToast } from "../use-add-to-dashboard-toast";
import { useAnalysis } from "../use-analysis";
import { useAnalysisState } from "../use-analysis-state";
import { useSaveAnalysis } from "../use-save-analysis";

import { AnalysisResult, getAnalysisRawSeries } from "./AnalysisResult";
import { AnalysisTitle, getNewAnalysisTitle } from "./AnalysisTitle";
import { AnalysisToolbar } from "./AnalysisToolbar";
import { DisplayPanel } from "./DisplayPanel";
import { FilterPills, useFilterCount } from "./FilterPills";
import { SetupPanel } from "./SetupPanel";
import { MembersModal } from "./drills/MembersModal";
import { SegmentsPanel } from "./palette/SegmentsPanel";
import { ToolbarSetting } from "./toolbar/ToolbarSetting";

type AnalysisWorkspaceProps<K extends AnalysisKind> = {
  kind: K;
  tableId: ConcreteTableId | undefined;
  savedCard?: Card;
  savedSettings?: StoredSettings;
  /** For a new analysis, where the toolbar's picker picks the table. */
  onTableChange?: (tableId: ConcreteTableId) => void;
};

/**
 * The event analysis page: the title and toolbar across the top, then the
 * segments panel, the setup panel, the result and the display panel side by
 * side. A new analysis opens the toolbar's table picker and shows nothing
 * below until a table is picked. The result fills the rest of the page. A
 * saved analysis opens on its result, with the setup panel collapsed.
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
  const handleToggleSegments = useCallback(
    () => setIsSegmentsOpen((isOpen) => !isOpen),
    [],
  );
  // The setup button's hover lights up the setup panel's border.
  const [isSetupHinted, setIsSetupHinted] = useState(false);
  // Likewise the segments button's hover and the segments panel.
  const [isSegmentsHinted, setIsSegmentsHinted] = useState(false);
  // Collapsed behind the Filters button until it's clicked; showing an empty
  // row opens its column picker, which a page load shouldn't do on its own.
  const [areFiltersExpanded, setAreFiltersExpanded] = useState(false);
  const [isDisplayOpen, setIsDisplayOpen] = useState(false);
  // PROTOTYPE: display changes live in this page's state, not the URL. Saving
  // keeps them on the card, but a saved analysis reopens without them.
  const [displayOverrides, setDisplayOverrides] =
    useState<VisualizationSettings>({});
  const [displayColors, setDisplayColors] = useState<DisplayColors>({});
  const handleChangeColor = useCallback(
    (key: string, color: string) =>
      setDisplayColors((colors) => ({ ...colors, [key]: color })),
    [],
  );
  const {
    stored,
    hasUnsavedChanges,
    panel,
    setPanel,
    onChangeSettings,
    onSaved,
  } = useAnalysisState<AnalysisSettingsByKind[K]>(savedSettings);
  const isSetupOpen = panel !== null && tableId !== undefined;
  const isSegmentsShowing = isSegmentsOpen && tableId !== undefined;
  const {
    config,
    table,
    usersTable,
    computed,
    spec,
    widgets,
    missing,
    display,
    question,
    vizSettings,
    colorSlots,
    query,
  } = useAnalysis({
    kind,
    tableId,
    stored,
    onChangeSettings,
    colors: displayColors,
  });
  // Only while "Show as" is offered: a view without it keeps the stored value.
  const breakoutViewWidget = widgets.find(
    (widget) => widget.id === "breakout_view",
  );
  const isPivot =
    breakoutViewWidget !== undefined &&
    !breakoutViewWidget.hidden &&
    computed.breakout_view === "pivot";
  const chartSettings = { ...vizSettings, ...displayOverrides };
  const isDisplayShowing = isDisplayOpen && tableId !== undefined;
  const filterCount = useFilterCount(computed.filters, table);
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
    countColumn: grainLabel(computed.counting),
    describePoint,
    queries: drillQueries,
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
          vizSettings: chartSettings,
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
      isPaletteOpen={isSegmentsShowing}
      onTogglePalette={handleToggleSegments}
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
            tableId={tableId}
            tableName={table?.display_name}
            onTableChange={onTableChange}
            isSegmentsOpen={isSegmentsOpen}
            onToggleSegments={handleToggleSegments}
            onHintSegments={setIsSegmentsHinted}
            setupLabel={config.setupLabel}
            sql={query.sql}
            canSave={canSave}
            isSaveDisabled={isSaveDisabled}
            isSetupOpen={isSetupOpen}
            onToggleSetup={() => setPanel(isSetupOpen ? null : "setup")}
            onHintSetup={setIsSetupHinted}
            onSave={handleSave}
            filterCount={filterCount}
            areFiltersExpanded={areFiltersExpanded}
            onToggleFilters={() => setAreFiltersExpanded((isOpen) => !isOpen)}
          />
          {areFiltersExpanded && tableId !== undefined && (
            <FilterPills
              value={computed.filters}
              table={table}
              onChange={handleFiltersChange}
            >
              <ToolbarSetting
                setting={widgets.find((widget) => widget.id === "filters")}
              />
            </FilterPills>
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
          {isSegmentsShowing && (
            <SegmentsPanel
              table={table}
              usersTable={usersTable}
              onSelectPeopleSegment={handleAddPeopleFilter}
              isHinted={isSegmentsHinted}
              onClose={() => setIsSegmentsOpen(false)}
            />
          )}
          {isSetupOpen && (
            <SetupPanel
              key={kind}
              tab={panel ?? "setup"}
              onTabChange={setPanel}
              setupLabel={config.setupLabel}
              widgets={widgets}
              isHinted={isSetupHinted}
              onClose={() => setPanel(null)}
            />
          )}
          {tableId !== undefined && (
            <Stack
              flex={1}
              miw={0}
              pr={isDisplayShowing ? 0 : "lg"}
              style={{ overflowY: "auto" }}
            >
              <AnalysisResult
                title={question}
                display={display}
                vizSettings={chartSettings}
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
                placeholder={isPivot ? getPivotPlaceholder() : undefined}
                isDisplayOpen={isDisplayShowing}
                onToggleDisplay={() => setIsDisplayOpen((isOpen) => !isOpen)}
              />
            </Stack>
          )}
          {isDisplayShowing && (
            <DisplayPanel
              series={
                query.isLoading || query.error
                  ? null
                  : getAnalysisRawSeries({
                      title: question,
                      display,
                      vizSettings: chartSettings,
                      dataset: query.dataset,
                      datasetQuery: query.datasetQuery,
                    })
              }
              baseSettings={vizSettings}
              onChange={setDisplayOverrides}
              colorSlots={colorSlots}
              onChangeColor={handleChangeColor}
              onClose={() => setIsDisplayOpen(false)}
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
      <LeaveRouteConfirmModal
        isEnabled={hasUnsavedChanges}
        isLocationAllowed={() =>
          isLocationAllowed() || drillActions.isDrilling()
        }
      />
    </SegmentDragProvider>
  );
};

const getPivotPlaceholder = () =>
  t`Pivot tables don't support native SQL, so they aren't available in this prototype.`;
