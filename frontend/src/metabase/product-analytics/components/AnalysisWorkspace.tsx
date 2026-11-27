import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { useMetadataProvider } from "metabase/metadata-store";
import { isEventTableSetUp } from "metabase/product-analytics-core";
import { Group, Paper, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { ProductAnalyticsKind, TableId } from "metabase-types/api";

import {
  getAnalysisConfig,
  getAnalysisSettingWidgets,
} from "../analyses/config";
import type { AnalysisSettingsByKind } from "../analyses/types";
import { useAnalysis } from "../use-analysis";
import { useStoredSettings } from "../use-stored-settings";

import { AnalysisResult } from "./AnalysisResult";
import { AnalysisTitle } from "./AnalysisTitle";
import { AnalysisToolbar } from "./AnalysisToolbar";
import S from "./AnalysisWorkspace.module.css";
import { FilterPills } from "./FilterPills";
import { SetupPanel } from "./SetupPanel";
import { TableNotSetUp } from "./TableNotSetUp";

const STAGE_INDEX = -1;

type AnalysisWorkspaceProps = {
  kind: ProductAnalyticsKind;
  tableId: TableId | undefined;
  onTableChange: (tableId: TableId) => void;
};

/**
 * A new analysis: the title and toolbar across the top, and the result below.
 * Without a table, the toolbar's table picker opens and nothing shows below.
 * Picking a table runs the analysis, and each settings change reruns it.
 */
export const AnalysisWorkspace = ({
  kind,
  tableId,
  onTableChange,
}: AnalysisWorkspaceProps) => {
  // Filters can use the columns of the tables the event table links to.
  const { table, isLoading, error } = useLoadTableWithMetadata(tableId, {
    includeForeignTables: true,
  });
  const isTableSetUp = table !== undefined && isEventTableSetUp(table);
  const eventTable = isTableSetUp ? table : undefined;
  const [areFiltersExpanded, { open: expandFilters, toggle: toggleFilters }] =
    useDisclosure(false);
  const [isSetupOpen, { close: closeSetup, toggle: toggleSetup }] =
    useDisclosure(true);
  const metadataProvider = useMetadataProvider(eventTable?.db_id ?? null);
  const { storedSettings, onChangeSettings } =
    useStoredSettings<AnalysisSettingsByKind[ProductAnalyticsKind]>();
  const {
    settings,
    baseQuery,
    analysis,
    query,
    rawSeries,
    isRunning,
    error: analysisError,
  } = useAnalysis({ kind, table: eventTable, storedSettings });

  const settingWidgets = useMemo(
    () =>
      eventTable !== undefined && settings !== undefined
        ? getAnalysisSettingWidgets(
            kind,
            { table: eventTable, metadataProvider },
            storedSettings,
            settings,
            onChangeSettings,
          )
        : undefined,
    [
      kind,
      eventTable,
      metadataProvider,
      storedSettings,
      settings,
      onChangeSettings,
    ],
  );

  const filterCount =
    baseQuery !== undefined ? Lib.filters(baseQuery, STAGE_INDEX).length : 0;

  const handleBaseQueryChange = (newBaseQuery: Lib.Query) =>
    onChangeSettings({ base_query: Lib.toJsQuery(newBaseQuery) });

  const handleFirstFilterAdd = (newBaseQuery: Lib.Query) => {
    handleBaseQueryChange(newBaseQuery);
    expandFilters();
  };

  return (
    <Stack flex={1} h="100%" gap={0} bg="background_page-secondary">
      <Stack
        className={S.header}
        gap="md"
        pl="xxl"
        pr="lg"
        pt="lg"
        pb="md"
        bg="background_page-primary"
      >
        <AnalysisTitle kind={kind} tableName={table?.display_name} />
        <AnalysisToolbar
          table={table}
          isTableLoading={isLoading}
          isTablePickerInitiallyOpened={tableId === undefined}
          settings={settings}
          options={getAnalysisConfig(kind).options}
          query={query}
          baseQuery={baseQuery}
          areFiltersExpanded={areFiltersExpanded}
          isSetupOpen={isSetupOpen}
          onTableChange={onTableChange}
          onChangeSettings={onChangeSettings}
          onToggleFilters={toggleFilters}
          onAddFirstFilter={handleFirstFilterAdd}
          onToggleSetup={toggleSetup}
        />
        {areFiltersExpanded && baseQuery !== undefined && filterCount > 0 && (
          <FilterPills query={baseQuery} onChange={handleBaseQueryChange} />
        )}
      </Stack>
      {tableId !== undefined && (
        <Group
          flex={1}
          mih={0}
          py="lg"
          pl="xxl"
          pr="lg"
          gap="lg"
          align="stretch"
          wrap="nowrap"
        >
          {isSetupOpen && settingWidgets !== undefined && (
            <SetupPanel widgets={settingWidgets} onClose={closeSetup} />
          )}
          <Paper withBorder radius="md" p="lg" flex={1} miw={0} display="flex">
            <LoadingAndErrorWrapper
              className={S.result}
              loading={isLoading}
              error={error}
            >
              {table !== undefined &&
                (isTableSetUp ? (
                  <AnalysisResult
                    title={analysis?.title}
                    display={analysis?.display}
                    rawSeries={rawSeries}
                    isRunning={isRunning}
                    error={analysisError}
                  />
                ) : (
                  <TableNotSetUp table={table} />
                ))}
            </LoadingAndErrorWrapper>
          </Paper>
        </Group>
      )}
    </Stack>
  );
};
