import { useCallback, useEffect, useMemo } from "react";

import type { Dataset } from "metabase-types/api";

import {
  getDefinitionName,
  getQueryFromDefinition,
} from "../adapters/definition-loader";
import { ALL_TAB_ID } from "../constants";
import type {
  DefinitionId,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  SelectedMetric,
} from "../types/viewer-state";
import {
  computeSourceColors,
  getSelectedMetricsInfo,
} from "../utils/series";
import {
  createMeasureSourceId,
  createMetricSourceId,
} from "../utils/source-ids";
import { TAB_TYPE_REGISTRY } from "../utils/tab-config";
import {
  type AvailableDimensionsResult,
  type SourceDisplayInfo,
  createTabFromColumn,
  getAvailableDimensionsForPicker,
  getBreakoutColumnsByType,
} from "../utils/tabs";

import { useDefinitionLoader } from "./use-definition-loader";
import { useQueryExecutor } from "./use-query-executor";
import { useViewerState } from "./use-viewer-state";
import { useViewerUrl } from "./use-viewer-url";

export interface UseMetricsViewerResult {
  definitions: MetricsViewerDefinitionEntry[];
  tabs: MetricsViewerTabState[];
  activeTab: MetricsViewerTabState | null;
  activeTabId: string;
  isAllTabActive: boolean;

  loadingIds: Set<DefinitionId>;
  resultsByDefinitionId: Map<DefinitionId, Dataset>;
  errorsByDefinitionId: Map<DefinitionId, string>;
  isExecuting: (id: DefinitionId) => boolean;

  sourceColors: Record<number, string>;
  selectedMetrics: SelectedMetric[];
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  availableDimensions: AvailableDimensionsResult;

  addMetric: (metric: SelectedMetric) => void;
  swapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  removeMetric: (id: number) => void;
  changeTab: (tabId: string) => void;
  addTab: (dimensionName: string) => void;
  removeTab: (tabId: string) => void;
  updateActiveTab: (updates: Partial<MetricsViewerTabState>) => void;
  changeDimension: (definitionId: DefinitionId, dimensionId: string) => void;
  changeCardDimension: (
    tabId: string,
    definitionId: DefinitionId,
    dimensionId: string,
  ) => void;
}

export function useMetricsViewer(): UseMetricsViewerResult {
  const {
    state,
    addDefinition,
    removeDefinition,
    updateDefinition,
    replaceDefinition,
    selectTab: changeTab,
    addTab: addTabState,
    removeTab,
    updateTab,
    setDefinitionDimension: changeCardDimension,
    initialize,
  } = useViewerState();

  const {
    loadingIds,
    loadAndAddMetric,
    loadAndAddMeasure,
    loadAndReplaceMetric,
    loadAndReplaceMeasure,
  } = useDefinitionLoader(state.definitions, {
    onAdd: addDefinition,
    onRemove: removeDefinition,
    onUpdate: updateDefinition,
    onReplace: replaceDefinition,
    onAddTab: addTabState,
  });

  const {
    resultsByDefinitionId,
    errorsByDefinitionId,
    isExecuting,
    executeForTab,
  } = useQueryExecutor();

  const handleLoadSources = useCallback(
    (request: { metricIds: number[]; measureIds: number[] }) => {
      for (const metricId of request.metricIds) {
        loadAndAddMetric(metricId);
      }
      for (const measureId of request.measureIds) {
        loadAndAddMeasure(measureId);
      }
    },
    [loadAndAddMetric, loadAndAddMeasure],
  );

  useViewerUrl(state, initialize, handleLoadSources);

  // ── Derived state ──

  const sourceColors = useMemo(
    () => computeSourceColors(state.definitions),
    [state.definitions],
  );

  const selectedMetrics = useMemo(
    () => getSelectedMetricsInfo(state.definitions, loadingIds),
    [state.definitions, loadingIds],
  );

  const activeTab = useMemo((): MetricsViewerTabState | null => {
    if (state.selectedTabId === ALL_TAB_ID || state.tabs.length === 0) {
      return null;
    }
    return (
      state.tabs.find((t) => t.id === state.selectedTabId) ??
      state.tabs[0] ??
      null
    );
  }, [state.tabs, state.selectedTabId]);

  const isAllTabActive =
    state.selectedTabId === ALL_TAB_ID && state.tabs.length > 1;

  const queriesBySourceId = useMemo(() => {
    const queries: Record<
      MetricSourceId,
      ReturnType<typeof getQueryFromDefinition>
    > = {};
    for (const entry of state.definitions) {
      queries[entry.id] = getQueryFromDefinition(entry.definition);
    }
    return queries;
  }, [state.definitions]);

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
      const name = getDefinitionName(definition);
      if (!name) {
        continue;
      }
      if (definition["source-metric"]) {
        result[entry.id] = { type: "metric", name };
      } else if (definition["source-measure"]) {
        result[entry.id] = { type: "measure", name };
      }
    }
    return result;
  }, [state.definitions]);

  const existingTabIds = useMemo(
    () => new Set(state.tabs.map((t) => t.id)),
    [state.tabs],
  );

  const fixedTabIds = useMemo(
    () =>
      new Set(
        TAB_TYPE_REGISTRY.filter((c) => c.fixedId).map((c) => c.fixedId!),
      ),
    [],
  );

  const effectiveTabs = useMemo(
    () =>
      state.tabs.map((tab) => {
        if (fixedTabIds.has(tab.id)) {
          return tab;
        }
        const firstDef = tab.definitions[0];
        if (!firstDef?.projectionDimensionId) {
          return tab;
        }
        const query =
          queriesBySourceId[firstDef.definitionId as MetricSourceId];
        if (!query) {
          return tab;
        }
        const columnsByType = getBreakoutColumnsByType(query);
        const colInfo = columnsByType.get(firstDef.projectionDimensionId);
        return colInfo ? { ...tab, label: colInfo.displayName } : tab;
      }),
    [state.tabs, queriesBySourceId, fixedTabIds],
  );

  const availableDimensions = useMemo(
    () =>
      getAvailableDimensionsForPicker(
        queriesBySourceId,
        sourceOrder,
        sourceDataById,
        existingTabIds,
      ),
    [queriesBySourceId, sourceOrder, sourceDataById, existingTabIds],
  );

  // ── Auto-execute effect ──

  useEffect(() => {
    if (!activeTab || state.definitions.length === 0) {
      return;
    }
    const hasLoadingTabDefs = activeTab.definitions.some((d) =>
      loadingIds.has(d.definitionId),
    );
    if (!hasLoadingTabDefs) {
      executeForTab(state.definitions, activeTab);
    }
  }, [activeTab, state.definitions, loadingIds, executeForTab]);

  // ── Handlers ──

  const addMetric = useCallback(
    (metric: SelectedMetric) => {
      const alreadySelected = selectedMetrics.some(
        (m) => m.id === metric.id && m.sourceType === metric.sourceType,
      );
      if (alreadySelected) {
        return;
      }

      if (metric.sourceType === "metric") {
        loadAndAddMetric(metric.id);
      } else {
        loadAndAddMeasure(metric.id);
      }
    },
    [selectedMetrics, loadAndAddMetric, loadAndAddMeasure],
  );

  const swapMetric = useCallback(
    (oldMetric: SelectedMetric, newMetric: SelectedMetric) => {
      const oldSourceId =
        oldMetric.sourceType === "metric"
          ? createMetricSourceId(oldMetric.id)
          : createMeasureSourceId(oldMetric.id);

      if (newMetric.sourceType === "metric") {
        loadAndReplaceMetric(oldSourceId, newMetric.id);
      } else {
        loadAndReplaceMeasure(oldSourceId, newMetric.id);
      }
    },
    [loadAndReplaceMetric, loadAndReplaceMeasure],
  );

  const removeMetric = useCallback(
    (id: number) => {
      const metricToRemove = selectedMetrics.find((m) => m.id === id);
      if (!metricToRemove) {
        return;
      }

      const sourceId =
        metricToRemove.sourceType === "metric"
          ? createMetricSourceId(id)
          : createMeasureSourceId(id);

      removeDefinition(sourceId);
    },
    [selectedMetrics, removeDefinition],
  );

  const addTab = useCallback(
    (dimensionName: string) => {
      const newTab = createTabFromColumn(
        dimensionName,
        queriesBySourceId,
        sourceOrder,
      );
      if (!newTab) {
        return;
      }

      addTabState(newTab);
      changeTab(newTab.id);
    },
    [queriesBySourceId, sourceOrder, addTabState, changeTab],
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
    (definitionId: DefinitionId, dimensionId: string) => {
      if (!activeTab) {
        return;
      }
      changeCardDimension(activeTab.id, definitionId, dimensionId);
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
    isExecuting,

    sourceColors,
    selectedMetrics,
    sourceOrder,
    sourceDataById,
    availableDimensions,

    addMetric,
    swapMetric,
    removeMetric,
    changeTab,
    addTab,
    removeTab,
    updateActiveTab,
    changeDimension,
    changeCardDimension,
  };
}
