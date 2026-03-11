import type { Location } from "history";
import { useMemo, useState } from "react";

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
    arithmeticResult,
    arithmeticIsExecuting,
    arithmeticError,
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
  } = useMetricsViewer(props, tokens);

  const expressionName = useMemo(() => {
    const metricCount = tokens.filter((t) => t.type === "metric").length;
    const opCount = tokens.filter((t) => t.type === "operator").length;
    if (metricCount < 2 || opCount === 0) {
      return null;
    }
    return tokens
      .map((token) => {
        if (token.type === "open-paren") {
          return "(";
        }
        if (token.type === "close-paren") {
          return ")";
        }
        if (token.type === "operator") {
          return token.op;
        }
        return selectedMetrics[token.metricIndex]?.name ?? "...";
      })
      .join(" ");
  }, [tokens, selectedMetrics]);

  const hasDefinitions = definitions.length > 0;
  const hasLoadedDefinitions = definitions.some(
    (entry) => entry.definition != null,
  );

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
          onExpressionChange={setTokens}
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
                  arithmeticResult={arithmeticResult}
                  arithmeticIsExecuting={arithmeticIsExecuting}
                  arithmeticError={arithmeticError}
                  expressionName={expressionName}
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
