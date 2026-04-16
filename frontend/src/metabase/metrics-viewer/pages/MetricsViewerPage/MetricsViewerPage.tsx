import type { Location } from "history";
import { useCallback } from "react";

import { Box, Flex, Stack } from "metabase/ui";

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
import {
  MetricsViewerTabContent,
  MetricsViewerTabs,
} from "../../components/MetricsViewerTabs";
import { useMetricsViewer } from "../../hooks/use-metrics-viewer";
import type { SelectedMetric } from "../../types/viewer-state";

import S from "./MetricsViewerPage.module.css";

export type MetricsViewerPageProps = {
  location: Location;
};

export function MetricsViewerPage(props: MetricsViewerPageProps) {
  const {
    definitions,
    tabs,
    activeTab,
    activeTabId,
    errorsByDefinitionId,
    modifiedDefinitions,
    series,
    cardIdToDefinitionId,
    activeBreakoutColors,
    sourceColors,
    selectedMetrics,
    sourceOrder,
    sourceDataById,
    availableDimensions,
    isExecuting,
    addMetric,
    swapMetric,
    removeMetric,
    changeTab,
    addAndSelectTab,
    removeTab,
    updateActiveTab,
    changeTabDimension,
    removeTabDimension,
    updateDefinition,
    setBreakoutDimension,
  } = useMetricsViewer(props);

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

  const hasDefinitions = definitions.length > 0;
  const hasLoadedDefinitions = definitions.some(
    (entry) => entry.definition != null,
  );

  return (
    <Stack px="3rem" h="100%" gap={0} className={S.root}>
      <Box pt="md" flex="0 0 auto">
        <MetricSearchPanel
          selectedMetrics={selectedMetrics}
          metricColors={sourceColors}
          definitions={definitions}
          onAddMetric={handleAddMetric}
          onRemoveMetric={handleRemoveMetric}
          onSwapMetric={swapMetric}
          onSetBreakout={setBreakoutDimension}
          onUpdateDefinition={updateDefinition}
        />
      </Box>
      <Flex flex="1 1 auto" mih={0}>
        <Stack gap={0} flex={1} mih={0} miw={0}>
          {hasDefinitions && (
            <Box pt="sm" flex="0 0 auto" className={S.tabsBar}>
              <MetricsViewerTabs
                tabs={tabs}
                activeTabId={activeTabId}
                isLoading={!hasLoadedDefinitions}
                availableDimensions={availableDimensions}
                sourceOrder={sourceOrder}
                sourceDataById={sourceDataById}
                onTabChange={changeTab}
                onAddTab={addAndSelectTab}
                onRemoveTab={removeTab}
              />
            </Box>
          )}
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
                  tab={activeTab}
                  errorsByDefinitionId={errorsByDefinitionId}
                  modifiedDefinitions={modifiedDefinitions}
                  series={series}
                  cardIdToDefinitionId={cardIdToDefinitionId}
                  sourceColors={sourceColors}
                  isExecuting={isExecuting}
                  onTabUpdate={updateActiveTab}
                  onDimensionChange={(defId, dim) =>
                    changeTabDimension(activeTab.id, defId, dim)
                  }
                  onDimensionRemove={(defId) =>
                    removeTabDimension(activeTab.id, defId)
                  }
                />
              ) : hasLoadedDefinitions ? (
                <MetricsViewerNoTabsEmptyState />
              ) : null}
            </Flex>
            <BreakoutLegend
              definitions={definitions}
              activeBreakoutColors={activeBreakoutColors}
            />
          </Flex>
        </Stack>
      </Flex>
    </Stack>
  );
}
