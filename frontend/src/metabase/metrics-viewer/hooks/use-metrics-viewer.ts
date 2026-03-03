import { useCallback, useMemo } from "react";

import { getObjectEntries, objectFromEntries } from "metabase/lib/objects";
import type {
  DimensionMetadata,
  MetricDefinition,
  ProjectionClause,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { Dataset, MetricBreakoutValuesResponse } from "metabase-types/api";

import { getDefinitionName } from "../adapters/definition-loader";
import { ALL_TAB_ID } from "../constants";
import type { MetricsViewerPageProps } from "../pages/MetricsViewerPage/MetricsViewerPage";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  SelectedMetric,
  SourceColorMap,
} from "../types/viewer-state";
import {
  applyDimensionFilter,
  buildBinnedBreakoutDef,
  findDimensionById,
  findFilterDimensionById,
} from "../utils/metrics";
import { computeSourceColors, getSelectedMetricsInfo } from "../utils/series";
import {
  createMeasureSourceId,
  createMetricSourceId,
  createSourceId,
} from "../utils/source-ids";
import {
  type AvailableDimensionsResult,
  type SourceDisplayInfo,
  createTabFromDimension,
  findMostSpecificCommonLabel,
  getAvailableDimensionsForPicker,
  getDimensionsByType,
} from "../utils/tabs";

import { useDefinitionQueries } from "./use-definition-queries";
import { useViewerState } from "./use-viewer-state";
import { type LoadSourcesRequest, useViewerUrl } from "./use-viewer-url";
export interface UseMetricsViewerResult {
  definitions: MetricsViewerDefinitionEntry[];
  tabs: MetricsViewerTabState[];
  activeTab: MetricsViewerTabState | null;
  activeTabId: string | null;
  isAllTabActive: boolean;

  loadingIds: Set<MetricSourceId>;
  resultsByDefinitionId: Map<MetricSourceId, Dataset>;
  errorsByDefinitionId: Map<MetricSourceId, string>;
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>;
  isExecuting: (id: MetricSourceId) => boolean;

  sourceColors: SourceColorMap;
  breakoutValuesBySourceId: Map<MetricSourceId, MetricBreakoutValuesResponse>;
  selectedMetrics: SelectedMetric[];
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  availableDimensions: AvailableDimensionsResult;

  addMetric: (metric: SelectedMetric) => void;
  swapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  removeMetric: (id: number, sourceType: "metric" | "measure") => void;
  changeTab: (tabId: string) => void;
  addAndSelectTab: (dimensionId: string) => void;
  removeTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<MetricsViewerTabState>) => void;
  updateActiveTab: (updates: Partial<MetricsViewerTabState>) => void;
  changeDimension: (
    definitionId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
  changeCardDimension: (
    tabId: string,
    definitionId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
  updateDefinition: (id: MetricSourceId, definition: MetricDefinition) => void;
  setBreakoutDimension: (
    id: MetricSourceId,
    dimension: ProjectionClause | undefined,
  ) => void;
}

function buildUrlRestoreTransform(
  sourceId: MetricSourceId,
  request: LoadSourcesRequest,
): ((definition: MetricDefinition) => MetricDefinition) | undefined {
  const breakoutId = request.breakoutBySourceId?.[sourceId];
  const filters = request.filtersBySourceId?.[sourceId];

  if (!breakoutId && (!filters || filters.length === 0)) {
    return undefined;
  }

  return (definition: MetricDefinition): MetricDefinition => {
    let result = definition;

    if (breakoutId) {
      const dimension = findDimensionById(result, breakoutId);
      if (dimension) {
        result = buildBinnedBreakoutDef(
          result,
          LibMetric.dimensionReference(dimension),
        );
      }
    }

    if (filters) {
      for (const filter of filters) {
        const dimension = findFilterDimensionById(result, filter.dimensionId);
        if (dimension) {
          result = applyDimensionFilter(result, dimension, filter.value);
        }
      }
    }

    return result;
  };
}

export function useMetricsViewer({
  location,
}: MetricsViewerPageProps): UseMetricsViewerResult {
  const {
    state,
    loadingIds,
    removeDefinition,
    updateDefinition,
    selectTab: changeTab,
    addTab,
    removeTab,
    updateTab,
    setDefinitionDimension: changeCardDimension,
    setBreakoutDimension,
    initialize,
    loadAndAddMetric,
    loadAndAddMeasure,
    loadAndReplaceMetric,
    loadAndReplaceMeasure,
  } = useViewerState();

  const handleLoadSources = useCallback(
    (request: LoadSourcesRequest) => {
      for (const metricId of request.metricIds) {
        const sourceId = createMetricSourceId(metricId);
        loadAndAddMetric(metricId, buildUrlRestoreTransform(sourceId, request));
      }
      for (const measureId of request.measureIds) {
        const sourceId = createMeasureSourceId(measureId);
        loadAndAddMeasure(
          measureId,
          buildUrlRestoreTransform(sourceId, request),
        );
      }
    },
    [loadAndAddMetric, loadAndAddMeasure],
  );

  useViewerUrl(state, initialize, handleLoadSources, location);

  const activeTab = useMemo((): MetricsViewerTabState | null => {
    if (state.selectedTabId === ALL_TAB_ID || state.tabs.length === 0) {
      return null;
    }
    return (
      state.tabs.find((t) => t.id === state.selectedTabId) ?? state.tabs[0]
    );
  }, [state.tabs, state.selectedTabId]);

  const {
    resultsByDefinitionId,
    errorsByDefinitionId,
    modifiedDefinitions,
    breakoutValuesBySourceId,
    isExecuting,
  } = useDefinitionQueries(state.definitions, activeTab);

  const selectedMetrics = useMemo(
    () => getSelectedMetricsInfo(state.definitions, loadingIds),
    [state.definitions, loadingIds],
  );

  const sourceColors = useMemo(
    () => computeSourceColors(state.definitions, breakoutValuesBySourceId),
    [state.definitions, breakoutValuesBySourceId],
  );

  const isAllTabActive =
    state.selectedTabId === ALL_TAB_ID && state.tabs.length > 1;

  const definitionsBySourceId = useMemo(
    () =>
      objectFromEntries(
        state.definitions.map((entry) => [entry.id, entry.definition] as const),
      ),
    [state.definitions],
  );

  const sourceOrder = useMemo(
    () => state.definitions.map((d) => d.id),
    [state.definitions],
  );

  const sourceDataById = useMemo((): Record<
    MetricSourceId,
    SourceDisplayInfo
  > => {
    const result: Record<MetricSourceId, SourceDisplayInfo> = {};
    for (const entry of state.definitions) {
      const { definition } = entry;
      if (!definition) {
        continue;
      }
      const name = getDefinitionName(definition);
      if (!name) {
        continue;
      }
      if (LibMetric.sourceMetricId(definition) != null) {
        result[entry.id] = { type: "metric", name };
      } else if (LibMetric.sourceMeasureId(definition) != null) {
        result[entry.id] = { type: "measure", name };
      }
    }
    return result;
  }, [state.definitions]);

  const existingTabIds = useMemo(
    () => new Set(state.tabs.map((t) => t.id)),
    [state.tabs],
  );

  const effectiveTabs = useMemo(() => {
    const dimsBySource = new Map(
      state.definitions
        .filter((entry) => entry.definition != null)
        .map(
          (entry) =>
            [entry.id, getDimensionsByType(entry.definition!)] as const,
        ),
    );

    return state.tabs.map((tab) => {
      const displayNames: string[] = [];
      for (const [sourceId, dimensionId] of getObjectEntries(
        tab.dimensionMapping,
      )) {
        const dimensionInfo = dimsBySource.get(sourceId)?.get(dimensionId);
        if (dimensionInfo) {
          displayNames.push(dimensionInfo.displayName);
        }
      }
      const label = findMostSpecificCommonLabel(displayNames, tab.label);
      return label !== tab.label ? { ...tab, label } : tab;
    });
  }, [state.tabs, state.definitions]);

  const availableDimensions = useMemo(
    () =>
      getAvailableDimensionsForPicker(
        definitionsBySourceId,
        sourceOrder,
        existingTabIds,
      ),
    [definitionsBySourceId, sourceOrder, existingTabIds],
  );

  const addMetric = useCallback(
    (metric: SelectedMetric) => {
      const sourceId = createSourceId(metric.id, metric.sourceType);

      if (state.definitions.some((d) => d.id === sourceId)) {
        return;
      }

      if (metric.sourceType === "metric") {
        loadAndAddMetric(metric.id);
      } else {
        loadAndAddMeasure(metric.id);
      }
    },
    [state.definitions, loadAndAddMetric, loadAndAddMeasure],
  );

  const swapMetric = useCallback(
    (oldMetric: SelectedMetric, newMetric: SelectedMetric) => {
      const oldSourceId = createSourceId(oldMetric.id, oldMetric.sourceType);

      if (newMetric.sourceType === "metric") {
        loadAndReplaceMetric(oldSourceId, newMetric.id);
      } else {
        loadAndReplaceMeasure(oldSourceId, newMetric.id);
      }
    },
    [loadAndReplaceMetric, loadAndReplaceMeasure],
  );

  const removeMetric = useCallback(
    (id: number, sourceType: "metric" | "measure") => {
      removeDefinition(createSourceId(id, sourceType));
    },
    [removeDefinition],
  );

  const addAndSelectTab = useCallback(
    (dimensionId: string) => {
      const newTab = createTabFromDimension(
        dimensionId,
        definitionsBySourceId,
        sourceOrder,
      );
      if (!newTab) {
        return;
      }

      addTab(newTab);
      changeTab(newTab.id);
    },
    [definitionsBySourceId, sourceOrder, addTab, changeTab],
  );

  const updateActiveTab = useCallback(
    (updates: Partial<MetricsViewerTabState>) => {
      if (!activeTab) {
        return;
      }
      updateTab(activeTab.id, updates);
    },
    [activeTab, updateTab],
  );

  const changeDimension = useCallback(
    (definitionId: MetricSourceId, dimension: DimensionMetadata) => {
      if (!activeTab) {
        return;
      }
      changeCardDimension(activeTab.id, definitionId, dimension);
    },
    [changeCardDimension, activeTab],
  );

  return {
    definitions: state.definitions,
    tabs: effectiveTabs,
    activeTab,
    activeTabId: state.selectedTabId,
    isAllTabActive,

    loadingIds,
    resultsByDefinitionId,
    errorsByDefinitionId,
    modifiedDefinitions,
    isExecuting,

    sourceColors,
    breakoutValuesBySourceId,
    selectedMetrics,
    sourceOrder,
    sourceDataById,
    availableDimensions,

    addMetric,
    swapMetric,
    removeMetric,
    changeTab,
    addAndSelectTab,
    removeTab,
    updateTab,
    updateActiveTab,
    changeDimension,
    changeCardDimension,
    updateDefinition,
    setBreakoutDimension,
  };
}
