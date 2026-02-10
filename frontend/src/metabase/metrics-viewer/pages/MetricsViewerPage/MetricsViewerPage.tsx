import { useCallback, useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Icon, Stack } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { MetricsViewerEmptyState } from "../../components/EmptyState";
import { FilterSidebar } from "../../components/FilterSidebar";
import { MetricSearch } from "../../components/MetricSearch";
import { MetricsViewerCardsGrid } from "../../components/MetricsViewerCardsGrid";
import {
  MetricsViewerTabContent,
  MetricsViewerTabs,
} from "../../components/MetricsViewerTabs";
import { useMetricsViewer } from "../../hooks/use-metrics-viewer";

import S from "./MetricsViewerPage.module.css";

const FILTER_SIDEBAR_WIDTH = 380;

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
    updateDefinition,
  } = useMetricsViewer();

  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(false);

  const toggleFilterSidebar = useCallback(() => {
    setIsFilterSidebarOpen((prev) => !prev);
  }, []);

  const hasDefinitions = definitions.length > 0;
  const hasFilters = definitions.some(
    (entry) =>
      entry.definition != null &&
      LibMetric.filters(entry.definition).length > 0,
  );

  return (
    <Stack h="100%" gap={0} className={S.root}>
      <Box px="lg" pt="lg" flex="0 0 auto">
        <MetricSearch
          selectedMetrics={selectedMetrics}
          metricColors={sourceColors}
          onAddMetric={addMetric}
          onRemoveMetric={removeMetric}
          onSwapMetric={swapMetric}
          rightSection={
            <Button
              variant={hasFilters ? "filled" : "default"}
              leftSection={<Icon name="filter" size={14} />}
              onClick={toggleFilterSidebar}
            >
              {t`Filter`}
            </Button>
          }
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
                onAddTab={addTab}
                onRemoveTab={removeTab}
              />
            </Box>
          )}
          <Flex
            direction="column"
            px="lg"
            pt="md"
            pb="lg"
            className={S.content}
          >
            {!hasDefinitions ? (
              <MetricsViewerEmptyState />
            ) : isAllTabActive ? (
              <MetricsViewerCardsGrid
                definitions={definitions}
                tabs={tabs}
                sourceColors={sourceColors}
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
        {isFilterSidebarOpen && (
          <FilterSidebar
            definitions={definitions}
            tabs={tabs}
            onDimensionChange={changeCardDimension}
            onUpdateDefinition={updateDefinition}
            onClose={() => setIsFilterSidebarOpen(false)}
            w={FILTER_SIDEBAR_WIDTH}
          />
        )}
      </Flex>
    </Stack>
  );
}
