import type { Location } from "history";

import { Box, Flex, Stack } from "metabase/ui";

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

import S from "./MetricsViewerPage.module.css";

export type MetricsViewerPageProps = {
  location: Location;
};

export function MetricsViewerPage(props: MetricsViewerPageProps) {
  const useMetricsViewerResult = useMetricsViewer(props);

  // eslint-disable-next-line no-console
  console.log("useMetricsViewer", useMetricsViewerResult);

  const {
    definitions,
    formulaEntities,
    tabs,
    activeTab,
    activeTabId,
    resultsByEntityIndex,
    errorsByDefinitionId,
    modifiedDefinitionsByIndex,
    sourceColors,
    breakoutValuesByEntityIndex,
    selectedMetrics,
    sourceOrder,
    sourceDataById,
    availableDimensions,
    isExecuting,
    expressionItems,
    addMetric,
    swapMetric,
    removeMetric,
    changeTab,
    addAndSelectTab,
    removeTab,
    updateActiveTab,
    changeTabDimension,
    removeTabDimension,
    setBreakoutDimension,
    setFormulaEntities,
  } = useMetricsViewerResult;

  const hasDefinitions = Object.keys(definitions).length > 0;
  const hasLoadedDefinitions = Object.values(definitions).some(
    (entry) => entry.definition != null,
  );

  return (
    <Stack h="100%" gap={0} className={S.root}>
      <Box px="xl" pt="md" flex="0 0 auto">
        <MetricSearchPanel
          definitions={definitions}
          formulaEntities={formulaEntities}
          onFormulaEntitiesChange={setFormulaEntities}
          selectedMetrics={selectedMetrics}
          metricColors={sourceColors}
          onAddMetric={addMetric}
          onRemoveMetric={removeMetric}
          onSwapMetric={swapMetric}
          onSetBreakout={setBreakoutDimension}
        />
      </Box>
      <Flex flex="1 1 auto" mih={0}>
        <Stack gap={0} flex={1} mih={0} miw={0}>
          {hasDefinitions && (
            <Box px="lg" pt="sm" flex="0 0 auto" className={S.tabsBar}>
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
              ) : activeTab ? (
                <MetricsViewerTabContent
                  definitions={definitions}
                  formulaEntities={formulaEntities}
                  tab={activeTab}
                  resultsByEntityIndex={resultsByEntityIndex}
                  errorsByDefinitionId={errorsByDefinitionId}
                  modifiedDefinitionsByIndex={modifiedDefinitionsByIndex}
                  sourceColors={sourceColors}
                  isExecuting={isExecuting}
                  expressionItems={expressionItems}
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
              formulaEntities={formulaEntities}
              definitions={definitions}
              breakoutValuesByEntityIndex={breakoutValuesByEntityIndex}
              sourceColors={sourceColors}
            />
          </Flex>
        </Stack>
      </Flex>
    </Stack>
  );
}
