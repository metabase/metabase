import { Box, Flex, Stack } from "metabase/ui";

import { BreakoutLegend } from "../../components/BreakoutLegend/BreakoutLegend";
import { MetricsViewerEmptyState } from "../../components/EmptyState";
import { MetricSearchPanel } from "../../components/MetricSearchPanel";
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
    modifiedDefinitions,
    sourceColors,
    breakoutValuesBySourceId,
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
    changeDimension,
    changeCardDimension,
    updateDefinition,
    setBreakoutDimension,
  } = useMetricsViewer();

  const hasDefinitions = definitions.length > 0;

  return (
    <Stack h="100%" gap={0} className={S.root}>
      <Box px="lg" pt="md" flex="0 0 auto">
        <MetricSearchPanel
          selectedMetrics={selectedMetrics}
          metricColors={sourceColors}
          definitions={definitions}
          onAddMetric={addMetric}
          onRemoveMetric={removeMetric}
          onSwapMetric={swapMetric}
          onSetBreakout={setBreakoutDimension}
          onUpdateDefinition={updateDefinition}
        />
      </Box>
      <Flex flex="1 1 auto" mih={0}>
        <Stack gap={0} flex={1} mih={0} miw={0}>
          {hasDefinitions && (
            <Box px="lg" pt="sm" flex="0 0 auto" className={S.tabsBar}>
              <MetricsViewerTabs
                tabs={tabs}
                activeTabId={activeTabId}
                availableDimensions={availableDimensions}
                sourceOrder={sourceOrder}
                sourceDataById={sourceDataById}
                onTabChange={changeTab}
                onAddTab={addAndSelectTab}
                onRemoveTab={removeTab}
              />
            </Box>
          )}
          <Flex flex="1 1 auto" mih={0}>
            <Flex
              direction="column"
              px="lg"
              pt="md"
              pb="lg"
              flex={1}
              miw={0}
              className={S.content}
            >
              {!hasDefinitions ? (
                <MetricsViewerEmptyState />
              ) : isAllTabActive ? (
                <MetricsViewerCardsGrid
                  definitions={definitions}
                  tabs={tabs}
                  onDimensionChange={changeCardDimension}
                  sourceColors={sourceColors}
                />
              ) : activeTab ? (
                <MetricsViewerTabContent
                  definitions={definitions}
                  tab={activeTab}
                  resultsByDefinitionId={resultsByDefinitionId}
                  errorsByDefinitionId={errorsByDefinitionId}
                  modifiedDefinitions={modifiedDefinitions}
                  sourceColors={sourceColors}
                  isExecuting={isExecuting}
                  onTabUpdate={updateActiveTab}
                  onDimensionChange={changeDimension}
                />
              ) : null}
            </Flex>
            <BreakoutLegend
              definitions={definitions}
              breakoutValuesBySourceId={breakoutValuesBySourceId}
              sourceColors={sourceColors}
            />
          </Flex>
        </Stack>
      </Flex>
    </Stack>
  );
}
