import { Box, Flex, Stack } from "metabase/ui";

import { MetricsViewerEmptyState } from "../../components/EmptyState";

import { MetricSearch } from "../../components/MetricSearch";
import { MetricsViewerCardsGrid } from "../../components/MetricsViewerCardsGrid";
import {
  MetricsViewerTabContent,
  MetricsViewerTabs,
} from "../../components/MetricsViewerTabs";
import { useMetricsViewer } from "../../hooks/use-metrics-viewer";

import S from "./MetricsViewerPage.module.css";

export function MetricsViewerPage() {
  const {
    definitions,
    tabs,
    activeTab,
    activeTabId,
    isAllTabActive,
    resultsByDefinitionId,
    errorsByDefinitionId,
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
    addTab,
    removeTab,
    updateActiveTab,
    changeDimension,
    changeCardDimension,
  } = useMetricsViewer();

  const hasDefinitions = definitions.length > 0;

  return (
    <Stack h="100%" gap={0} className={S.root}>
      <Box px="lg" pt="lg" pb="sm" flex="0 0 auto">
        <MetricSearch
          selectedMetrics={selectedMetrics}
          metricColors={sourceColors}
          onAddMetric={addMetric}
          onRemoveMetric={removeMetric}
          onSwapMetric={swapMetric}
        />
      </Box>
      {hasDefinitions && (
        <Box px="lg" mb="md" flex="0 0 auto" className={S.tabsBar}>
          <MetricsViewerTabs
            tabs={tabs}
            activeTabId={activeTabId}
            availableDimensions={availableDimensions}
            sourceOrder={sourceOrder}
            sourceDataById={sourceDataById}
            onTabChange={changeTab}
            onAddTab={addTab}
            onRemoveTab={removeTab}
          />
        </Box>
      )}
      <Flex flex="1 0 auto" direction="column" px="lg" pb="lg">
        {!hasDefinitions ? (
          <MetricsViewerEmptyState />
        ) : isAllTabActive ? (
          <MetricsViewerCardsGrid
            definitions={definitions}
            tabs={tabs}
            onDimensionChange={changeCardDimension}
          />
        ) : activeTab ? (
          <MetricsViewerTabContent
            definitions={definitions}
            tab={activeTab}
            resultsByDefinitionId={resultsByDefinitionId}
            errorsByDefinitionId={errorsByDefinitionId}
            sourceColors={sourceColors}
            isExecuting={isExecuting}
            onTabUpdate={updateActiveTab}
            onDimensionChange={changeDimension}
          />
        ) : null}
      </Flex>
    </Stack>
  );
}
