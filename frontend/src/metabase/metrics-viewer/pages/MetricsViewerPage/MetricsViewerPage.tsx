import type { Location } from "history";
import { useCallback, useState } from "react";

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
import type { AdhocResult } from "../../components/SummarizeTable";
import { useMetricsViewer } from "../../hooks/use-metrics-viewer";
import type { ExpressionToken } from "../../types/operators";

import S from "./MetricsViewerPage.module.css";

export type MetricsViewerPageProps = {
  location: Location;
};

export function MetricsViewerPage(props: MetricsViewerPageProps) {
  const [tokens, setTokens] = useState<ExpressionToken[]>([]);

  const {
    definitions,
    tabs,
    activeTab,
    activeTabId,
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
    expressionItems,
    standaloneSourceIds,
    addMetric,
    addAdhocMetric,
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
  } = useMetricsViewer(props, tokens, setTokens);

  const handleAddAdhoc = useCallback(
    (result: AdhocResult) => {
      addAdhocMetric({
        uuid: result.uuid,
        databaseId: result.databaseId,
        tableId: result.tableId,
        tableName: result.tableName,
        aggregationOperator: result.aggregationOperator,
        column: result.column,
        displayName: result.displayName,
      });

      // Append a token so the adhoc metric appears in the text box / as a pill.
      // The new metric will be appended to selectedMetrics at this index.
      const newIndex = selectedMetrics.length;
      const metricToken: ExpressionToken = {
        type: "metric",
        metricIndex: newIndex,
      };
      setTokens((prev) =>
        prev.length > 0
          ? [...prev, { type: "separator" as const }, metricToken]
          : [metricToken],
      );
    },
    [addAdhocMetric, selectedMetrics.length, setTokens],
  );

  const hasDefinitions = definitions.length > 0;
  const hasLoadedDefinitions = definitions.some(
    (entry) => entry.definition != null,
  );

  return (
    <Stack h="100%" gap={0} className={S.root}>
      <Box px="lg" pt="md" flex="0 0 auto">
        <MetricSearchPanel
          tokens={tokens}
          onTokensChange={setTokens}
          selectedMetrics={selectedMetrics}
          metricColors={sourceColors}
          definitions={definitions}
          onAddMetric={addMetric}
          onRemoveMetric={removeMetric}
          onSwapMetric={swapMetric}
          onSetBreakout={setBreakoutDimension}
          onUpdateDefinition={updateDefinition}
          onAddAdhoc={handleAddAdhoc}
        />
      </Box>
      <Flex flex="1 1 auto" mih={0}>
        <Stack gap={0} flex={1} mih={0} miw={0}>
          {hasDefinitions && (
            <Box px="lg" pt="xs" flex="0 0 auto" className={S.tabsBar}>
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
                  tab={activeTab}
                  resultsByDefinitionId={resultsByDefinitionId}
                  errorsByDefinitionId={errorsByDefinitionId}
                  modifiedDefinitions={modifiedDefinitions}
                  sourceColors={sourceColors}
                  isExecuting={isExecuting}
                  expressionItems={expressionItems}
                  standaloneSourceIds={standaloneSourceIds}
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
              breakoutValuesBySourceId={breakoutValuesBySourceId}
              sourceColors={sourceColors}
            />
          </Flex>
        </Stack>
      </Flex>
    </Stack>
  );
}
