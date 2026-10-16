import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { AddToDashSelectDashModal } from "metabase/common/components/Pickers/AddToDashSelectDashModal";
import { SaveQuestionModal } from "metabase/common/components/SaveQuestionModal";
import { DND_IGNORE_CLASS_NAME } from "metabase/common/components/dnd";
import { useNavigate } from "metabase/router";
import { Group, Stack, Title } from "metabase/ui";
import type { Card, ConcreteTableId } from "metabase-types/api";

import { pickSettingsForKind } from "../analyses/config";
import type { AnalysisSettingsByKind } from "../analyses/types";
import { buildAnalysisCard } from "../analysis-card";
import { useDrillActions } from "../drills/use-drill-actions";
import { useDrillQueries } from "../drills/use-drill-queries";
import { type AnalysisFilters, withPeopleFilter } from "../filters";
import { setLastTableId } from "../last-table";
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

import { AnalysisResult } from "./AnalysisResult";
import { AnalysisTabs } from "./AnalysisTabs";
import { AnalysisToolbar } from "./AnalysisToolbar";
import { FilterPills } from "./FilterPills";
import { SettingsPanel } from "./SettingsPanel";
import { CreateSegmentModal } from "./drills/CreateSegmentModal";
import { MembersModal } from "./drills/MembersModal";
import { SegmentPalette } from "./palette/SegmentPalette";

type AnalysisWorkspaceProps<K extends AnalysisKind> = {
  kind: K;
  tableId: ConcreteTableId | undefined;
  savedCard?: Card;
  savedSettings?: StoredSettings;
  /** For a new analysis, where tabs switch between kinds. */
  onKindChange?: (kind: AnalysisKind) => void;
  /** For a new analysis, where the palette picks the table. */
  onTableChange?: (tableId: ConcreteTableId) => void;
  isTableLoading?: boolean;
  tableError?: string;
};

/**
 * The event analysis page: the kind tabs for a new analysis, the title and
 * the toolbar across the top; below them the segment palette on the far
 * left, then the setup panel beside the result. A saved analysis opens on
 * its result, with both side panels collapsed.
 */
export const AnalysisWorkspace = <K extends AnalysisKind>({
  kind,
  tableId,
  savedCard,
  savedSettings,
  onKindChange,
  onTableChange,
  isTableLoading = false,
  tableError,
}: AnalysisWorkspaceProps<K>) => {
  const navigate = useNavigate();
  const isNew = savedSettings === undefined;
  const [isPaletteOpen, setIsPaletteOpen] = useState(isNew);
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
    usersTable,
    computed,
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
  });

  useEffect(() => {
    if (tableId !== undefined) {
      setLastTableId(tableId);
    }
  }, [tableId]);

  const tableName = table?.display_name ?? t`this table`;
  const title = savedCard?.name ?? t`${config.name} analysis on ${tableName}`;

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

  const handleFiltersChange = (filters: AnalysisFilters) =>
    widgets.find((widget) => widget.id === "filters")?.onChange(filters);
  const handleAddPeopleFilter = (segment: PaletteSegment) =>
    handleFiltersChange(withPeopleFilter(computed.filters, segment));

  return (
    <SegmentDragProvider
      isPaletteOpen={isPaletteOpen}
      onPeopleSegment={handleAddPeopleFilter}
    >
      {/* Keeps the app-wide react-dnd backend out of the palette's native drags. */}
      <Group
        className={DND_IGNORE_CLASS_NAME}
        flex={1}
        h="100%"
        gap={0}
        align="stretch"
        wrap="nowrap"
        bg="background-secondary"
      >
        <Stack flex={1} miw={0} h="100%" gap={0}>
          {onKindChange !== undefined && (
            <AnalysisTabs kind={kind} onChange={onKindChange} />
          )}
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
              isPaletteOpen={isPaletteOpen}
              onTogglePalette={() => setIsPaletteOpen((isOpen) => !isOpen)}
              onPanelChange={setPanel}
              onSave={handleSave}
            />
            <FilterPills
              value={computed.filters}
              table={table}
              onChange={handleFiltersChange}
            />
          </Stack>
          <Group gap={0} wrap="nowrap" flex={1} align="stretch" mih={0}>
            {isPaletteOpen && (
              <SegmentPalette
                tableId={tableId}
                table={table}
                usersTable={usersTable}
                isTableLoading={isTableLoading}
                tableError={tableError}
                onTableChange={onTableChange}
                onSelectPeopleSegment={handleAddPeopleFilter}
              />
            )}
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
              {panel && (
                <SettingsPanel key={kind} panel={panel} widgets={widgets} />
              )}
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
                onOpenSetup={
                  panel !== "setup" ? () => setPanel("setup") : undefined
                }
                clickActionsMode={drillActions.mode}
              />
            </Group>
          </Group>
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
