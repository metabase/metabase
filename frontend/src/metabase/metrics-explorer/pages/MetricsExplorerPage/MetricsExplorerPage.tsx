import { useCallback } from "react";

import { useSelector } from "metabase/lib/redux";
import { Flex, Stack } from "metabase/ui";
import type {
  MetricsExplorerDisplayType,
  ProjectionConfig,
} from "metabase-types/store/metrics-explorer";

import { DimensionTabs } from "../../components/DimensionTabs";
import { MetricExplorerEmptyState } from "../../components/EmptyState/MetricExplorerEmptyState";
import { getDefaultDisplayTypeForTab } from "../../components/MetricControls/MetricControls";
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
  cardIdToSourceId,
  createMeasureSourceId,
  createMetricSourceId,
} from "../../utils/source-ids";

type MetricsExplorerPageProps = {
  location: {
    hash: string;
  };
};

export function MetricsExplorerPage({
  location,
}: MetricsExplorerPageProps): JSX.Element {
  // Sync URL state with Redux
  useUrlSync(location.hash);

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
    removeSource,
    setProjectionConfig,
    setDimensionOverride,
    setDisplayType,
    setActiveTab,
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
      } else if (metric.tableId) {
        addMeasure(metric.id, metric.tableId);
      }
    },
    [selectedMetrics, addMetric, addMeasure],
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

  const handleDimensionOverrideChange = useCallback(
    (cardId: number, columnName: string) => {
      const sourceId = cardIdToSourceId(cardId);
      setDimensionOverride(sourceId, columnName);
    },
    [setDimensionOverride],
  );

  const handleDisplayTypeChange = useCallback(
    (newDisplayType: MetricsExplorerDisplayType) => {
      setDisplayType(newDisplayType);
    },
    [setDisplayType],
  );

  const handleTabChange = useCallback(
    (tabId: string) => {
      const tab = dimensionTabs.find((t) => t.id === tabId);
      const tabType = tab?.type ?? null;
      const defaultDisplayType = getDefaultDisplayTypeForTab(tabType);
      setActiveTab(tabId, defaultDisplayType);
    },
    [dimensionTabs, setActiveTab],
  );

  // Map selectedMetrics to SelectedMetric format (omit sourceId)
  const selectedMetricsForSearch: SelectedMetric[] = selectedMetrics.map(
    ({ sourceId: _, ...rest }) => rest,
  );

  // Show time controls only when on the time tab
  const showTimeControls = activeTabType === "time" || activeTabType === null;

  return (
    <Stack h="100%" p="lg" gap={0} styles={{ root: { overflow: "auto" } }}>
      <Stack gap="sm" pb="sm" style={{ flexShrink: 0 }}>
        <MetricSearch
          selectedMetrics={selectedMetricsForSearch}
          metricColors={sourceColors}
          onAddMetric={handleAddMetric}
          onRemoveMetric={handleRemoveMetric}
        />
        {sourceOrder.length > 0 && (
          <DimensionTabs
            activeTabId={activeTabId}
            onTabChange={handleTabChange}
          />
        )}
      </Stack>
      <Flex flex="1 0 auto" direction="column">
        {sourceOrder.length > 0 ? (
          <MetricVisualization
            projectionConfig={projectionConfig ?? { unit: "month", filterSpec: null }}
            displayType={displayType}
            isLoading={isLoading || !projectionConfig}
            error={error}
            showTimeControls={showTimeControls}
            onProjectionConfigChange={handleProjectionConfigChange}
            onDimensionOverrideChange={handleDimensionOverrideChange}
            onDisplayTypeChange={handleDisplayTypeChange}
          />
        ) : (
          <MetricExplorerEmptyState />
        )}
      </Flex>
    </Stack>
  );
}
