import { useCallback } from "react";

import { useSelector } from "metabase/lib/redux";
import { Box, Flex, Stack } from "metabase/ui";
import type {
  MetricsExplorerDisplayType,
  ProjectionConfig,
} from "metabase-types/store/metrics-explorer";
import { createTemporalProjectionConfig } from "metabase-types/store/metrics-explorer";

import { DimensionTabs } from "../../components/DimensionTabs";
import { MetricExplorerEmptyState } from "../../components/EmptyState/MetricExplorerEmptyState";
import { MetricSearch } from "../../components/MetricSearch/MetricSearch";
import type { SelectedMetric } from "../../components/MetricSearch/MetricSearchInput";
import { MetricVisualization } from "../../components/MetricVisualization/MetricVisualization";
import { useExplorerActions, useUrlSync } from "../../hooks/use-url-sync";
import {
  selectActiveTabId,
  selectActiveTabType,
  selectDimensionTabs,
  selectDisplayType,
  selectError,
  selectIsLoading,
  selectProjectionConfig,
  selectSelectedMetrics,
  selectSourceColors,
  selectSourceOrder,
} from "../../selectors";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../../utils/source-ids";
import { ALL_TAB_ID } from "../../utils/tab-registry";

type MetricsExplorerPageProps = {
  location: {
    hash: string;
    search: string;
  };
};

export function MetricsExplorerPage({
  location,
}: MetricsExplorerPageProps): JSX.Element {
  useUrlSync(location.hash, location.search);

  // Get state from Redux
  const sourceOrder = useSelector(selectSourceOrder);
  const selectedMetrics = useSelector(selectSelectedMetrics);
  const sourceColors = useSelector(selectSourceColors);
  const projectionConfig = useSelector(selectProjectionConfig);
  const displayType = useSelector(selectDisplayType);
  const isLoading = useSelector(selectIsLoading);
  const error = useSelector(selectError);
  const activeTabId = useSelector(selectActiveTabId);
  const activeTabType = useSelector(selectActiveTabType);
  const dimensionTabs = useSelector(selectDimensionTabs);

  // Get actions
  const {
    addMetric,
    addMeasure,
    swapSource,
    removeSource,
    setProjectionConfig,
    setDisplayType,
    setActiveTab,
    addTab,
    removeTab,
  } = useExplorerActions();

  const handleAddMetric = useCallback(
    (metric: SelectedMetric) => {
      // Check if already selected
      const alreadySelected = selectedMetrics.some(
        (m) => m.id === metric.id && m.sourceType === metric.sourceType,
      );
      if (alreadySelected) {
        return;
      }

      if (metric.sourceType === "metric") {
        addMetric(metric.id);
      } else {
        addMeasure(metric.id);
      }
    },
    [selectedMetrics, addMetric, addMeasure],
  );

  const handleSwapMetric = useCallback(
    (oldMetric: SelectedMetric, newMetric: SelectedMetric) => {
      swapSource(
        oldMetric.id,
        oldMetric.sourceType,
        newMetric.id,
        newMetric.sourceType,
      );
    },
    [swapSource],
  );

  const handleRemoveMetric = useCallback(
    (id: number) => {
      // Find the source to remove
      const metricToRemove = selectedMetrics.find((m) => m.id === id);
      if (!metricToRemove) {
        return;
      }

      const sourceId =
        metricToRemove.sourceType === "metric"
          ? createMetricSourceId(id)
          : createMeasureSourceId(id);

      removeSource(sourceId);
    },
    [selectedMetrics, removeSource],
  );

  const handleProjectionConfigChange = useCallback(
    (config: ProjectionConfig) => {
      setProjectionConfig(config);
    },
    [setProjectionConfig],
  );

  const handleDisplayTypeChange = useCallback(
    (newDisplayType: MetricsExplorerDisplayType) => {
      setDisplayType(newDisplayType);
    },
    [setDisplayType],
  );

  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
    },
    [setActiveTab],
  );

  const handleAddTab = useCallback(
    (columnName: string) => {
      addTab(columnName);
    },
    [addTab],
  );

  const handleRemoveTab = useCallback(
    (tabId: string) => {
      const remainingTabs = dimensionTabs.filter((t) => t.id !== tabId);
      const needsTabSwitch =
        tabId === activeTabId ||
        (activeTabId === ALL_TAB_ID && remainingTabs.length <= 1);

      if (needsTabSwitch && remainingTabs[0]) {
        setActiveTab(remainingTabs[0].id);
      }
      removeTab(tabId);
    },
    [removeTab, activeTabId, dimensionTabs, setActiveTab],
  );

  // Map selectedMetrics to SelectedMetric format (omit sourceId)
  const selectedMetricsForSearch: SelectedMetric[] = selectedMetrics.map(
    ({ sourceId: _, ...rest }) => rest,
  );

  // Show time controls only when on the time tab
  const showTimeControls = activeTabType === "time" || activeTabType === null;

  return (
    <Stack h="100%" gap={0} style={{ overflow: "auto" }}>
      <Box px="lg" pt="lg" pb="sm" style={{ flexShrink: 0 }}>
        <MetricSearch
          selectedMetrics={selectedMetricsForSearch}
          metricColors={sourceColors}
          onAddMetric={handleAddMetric}
          onRemoveMetric={handleRemoveMetric}
          onSwapMetric={handleSwapMetric}
        />
      </Box>
      {sourceOrder.length > 0 && (
        <Box
          px="lg"
          mb="md"
          style={{
            flexShrink: 0,
            borderBottom: "1px solid var(--mb-color-border)",
          }}
        >
          <DimensionTabs
            activeTabId={activeTabId}
            onTabChange={handleTabChange}
            onAddTab={handleAddTab}
            onRemoveTab={handleRemoveTab}
          />
        </Box>
      )}
      <Flex flex="1 0 auto" direction="column" px="lg" pb="lg">
        {sourceOrder.length > 0 ? (
          <MetricVisualization
            projectionConfig={
              projectionConfig ?? createTemporalProjectionConfig("month")
            }
            displayType={displayType}
            isLoading={isLoading || !projectionConfig}
            error={error}
            showTimeControls={showTimeControls}
            onProjectionConfigChange={handleProjectionConfigChange}
            onDisplayTypeChange={handleDisplayTypeChange}
          />
        ) : (
          <MetricExplorerEmptyState />
        )}
      </Flex>
    </Stack>
  );
}
