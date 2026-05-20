import type { Location } from "history";
import { useCallback } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Center, Flex, Stack } from "metabase/ui";

import {
  trackMetricsViewerMetricAdded,
  trackMetricsViewerMetricRemoved,
} from "../../analytics";
import { BreakoutLegend } from "../../components/BreakoutLegend/BreakoutLegend";
import {
  MetricsViewerEmptyState,
  MetricsViewerNoTabsEmptyState,
} from "../../components/EmptyState";
import { MetricSearchPanel } from "../../components/MetricSearchPanel";
import { MetricsViewerTabContent } from "../../components/MetricsViewerTabs";
import { useMetricsViewer } from "../../hooks/use-metrics-viewer";
import type { SelectedMetric } from "../../types/viewer-state";

import S from "./MetricsViewerPage.module.css";

export type MetricsViewerPageProps = {
  location: Location;
};

export function MetricsViewerPage(props: MetricsViewerPageProps) {
  const useMetricsViewerResult = useMetricsViewer(props);

  const {
    definitions,
    formulaEntities,
    tabs,
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
    availableDimensions,
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
  const hasMultipleSources = sourceOrder.length > 1;
  const canAddScalarTab = !tabs.some((tab) => tab.type === "scalar");

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
                  availableDimensions={availableDimensions}
                  sourceOrder={sourceOrder}
                  sourceDataById={sourceDataById}
                  hasMultipleSources={hasMultipleSources}
                  canAddScalarTab={canAddScalarTab}
                  onTabUpdate={updateActiveTab}
                  onDimensionChange={(slotIndex, dim) =>
                    changeTabDimension(activeTab.id, slotIndex, dim)
                  }
                  onDimensionRemove={(slotIndex) =>
                    removeTabDimension(activeTab.id, slotIndex)
                  }
                  onAddTab={addAndSelectTab}
                />
              ) : hasLoadedDefinitions ? (
                <MetricsViewerNoTabsEmptyState />
              ) : null}
            </Flex>
            {activeTab?.type !== "scalar" && (
              <BreakoutLegend
                formulaEntities={formulaEntities}
                definitions={definitions}
                activeBreakoutColors={activeBreakoutColors}
              />
            )}
          </Flex>
        </Stack>
      </Flex>
    </Stack>
  );
}
