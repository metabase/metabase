import type { Location } from "history";
import { useCallback } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  trackMetricsViewerMetricAdded,
  trackMetricsViewerMetricRemoved,
} from "metabase/metrics-viewer/analytics";
import { BreakoutLegend } from "metabase/metrics-viewer/components/BreakoutLegend/BreakoutLegend";
import {
  DimensionPickerSidebar,
  DimensionPickerSidebarProvider,
  useDimensionPickerSidebar,
} from "metabase/metrics-viewer/components/DimensionPickerSidebar";
import {
  MetricsViewerEmptyState,
  MetricsViewerNoTabsEmptyState,
} from "metabase/metrics-viewer/components/EmptyState";
import { MetricSearchPanel } from "metabase/metrics-viewer/components/MetricSearchPanel";
import { MetricsViewerTabContent } from "metabase/metrics-viewer/components/MetricsViewerTabs";
import { useMetricsViewer } from "metabase/metrics-viewer/hooks";
import type { SelectedMetric } from "metabase/metrics-viewer/types";
import { Box, Center, Flex, Stack } from "metabase/ui";

import S from "./MetricsViewerPage.module.css";

export type MetricsViewerPageProps = {
  location: Location;
};

export function MetricsViewerPage(props: MetricsViewerPageProps) {
  return (
    <DimensionPickerSidebarProvider>
      <MetricsViewerPageContent {...props} />
    </DimensionPickerSidebarProvider>
  );
}

function MetricsViewerPageContent(props: MetricsViewerPageProps) {
  const { isOpen: isDimensionPickerSidebarOpen } = useDimensionPickerSidebar();
  const useMetricsViewerResult = useMetricsViewer(props);

  const {
    definitions,
    formulaEntities,
    activeTab,
    initialLoadComplete,
    queriesAreLoading,
    queriesError,
    modifiedDefinitionsBySlotIndex,
    metricSlots,
    series,
    cardIdToEntityIndex,
    activeBreakoutColors,
    sourceColors,
    selectedMetrics,
    sourceOrder,
    sourceDataById,
    activeTabAvailableDimensions,
    sidebarAvailableDimensions,
    addMetric,
    swapMetric,
    removeMetric,
    addAndSelectTab,
    updateActiveTab,
    changeTabDimension,
    removeTabDimension,
    setBreakoutDimension,
    setFormulaEntities,
  } = useMetricsViewerResult;

  const handleAddMetric = useCallback(
    (metric: SelectedMetric) => {
      addMetric(metric);
      trackMetricsViewerMetricAdded(metric.id, metric.sourceType);
    },
    [addMetric],
  );

  const handleRemoveMetric = useCallback(
    (metricId: number, sourceType: "metric" | "measure") => {
      removeMetric(metricId, sourceType);
      trackMetricsViewerMetricRemoved(metricId, sourceType);
    },
    [removeMetric],
  );

  if (!initialLoadComplete) {
    // parsing formulas won't work until the initial set of definitions are loaded
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading />
      </Center>
    );
  }

  const hasDefinitions = Object.keys(definitions).length > 0;
  const hasLoadedDefinitions = Object.values(definitions).some(
    (entry) => entry.definition != null,
  );

  return (
    <Stack px="3rem" h="100%" gap={0} className={S.root}>
      <Box pt="md" flex="0 0 auto">
        <MetricSearchPanel
          definitions={definitions}
          formulaEntities={formulaEntities}
          onFormulaEntitiesChange={setFormulaEntities}
          selectedMetrics={selectedMetrics}
          metricColors={sourceColors}
          onAddMetric={handleAddMetric}
          onRemoveMetric={handleRemoveMetric}
          onSwapMetric={swapMetric}
          onSetBreakout={setBreakoutDimension}
        />
      </Box>
      <Flex flex="1 1 auto" mih={0}>
        <Stack gap={0} flex={1} mih={0} miw={0}>
          <Flex flex="1 1 auto" mih={0} pt="lg">
            <Flex
              direction="column"
              pt="md"
              pb="lg"
              flex={1}
              miw={0}
              className={S.content}
            >
              {!hasDefinitions ? (
                <MetricsViewerEmptyState />
              ) : activeTab ? (
                <MetricsViewerTabContent
                  definitions={definitions}
                  formulaEntities={formulaEntities}
                  tab={activeTab}
                  queriesAreLoading={queriesAreLoading}
                  queriesError={queriesError}
                  modifiedDefinitionsBySlotIndex={
                    modifiedDefinitionsBySlotIndex
                  }
                  metricSlots={metricSlots}
                  series={series}
                  cardIdToEntityIndex={cardIdToEntityIndex}
                  sourceColors={sourceColors}
                  availableDimensions={activeTabAvailableDimensions}
                  sourceOrder={sourceOrder}
                  onTabUpdate={updateActiveTab}
                  onDimensionChange={(slotIndex, dim) =>
                    changeTabDimension(activeTab.id, slotIndex, dim)
                  }
                  onDimensionRemove={(slotIndex) =>
                    removeTabDimension(activeTab.id, slotIndex)
                  }
                />
              ) : hasLoadedDefinitions ? (
                <MetricsViewerNoTabsEmptyState />
              ) : null}
            </Flex>
            {activeTab &&
              activeTab.type !== "scalar" &&
              (isDimensionPickerSidebarOpen ? (
                <DimensionPickerSidebar
                  activeTab={activeTab}
                  availableDimensions={sidebarAvailableDimensions}
                  allFieldsAvailableDimensions={activeTabAvailableDimensions}
                  metricSlots={metricSlots}
                  sourceColors={sourceColors}
                  metricSourceOrder={sourceOrder}
                  metricSourceDataById={sourceDataById}
                  onAddTab={addAndSelectTab}
                  onUpdateActiveTab={updateActiveTab}
                />
              ) : (
                <BreakoutLegend
                  formulaEntities={formulaEntities}
                  definitions={definitions}
                  activeBreakoutColors={activeBreakoutColors}
                />
              ))}
          </Flex>
        </Stack>
      </Flex>
    </Stack>
  );
}
