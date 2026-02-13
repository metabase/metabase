import { useCallback, useEffect, useMemo } from "react";
import { useLatest } from "react-use";

import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { Dataset } from "metabase-types/api";

import { getDefinitionName } from "../adapters/definition-loader";
import { ALL_TAB_ID } from "../constants";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  SelectedMetric,
  SourceColorMap,
} from "../types/viewer-state";
import {
  buildRawSeriesFromDefinitions,
  computeColorsFromRawSeries,
  computeModifiedDefinitions,
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
  createTabFromDimension,
  getAvailableDimensionsForPicker,
  getDimensionsByType,
} from "../utils/tabs";

import { useDefinitionLoader } from "./use-definition-loader";
import { useQueryExecutor } from "./use-query-executor";
import { useViewerState } from "./use-viewer-state";
import { useViewerUrl } from "./use-viewer-url";

export interface UseMetricsViewerResult {
  definitions: MetricsViewerDefinitionEntry[];
  tabs: MetricsViewerTabState[];
  activeTab: MetricsViewerTabState | null;
  activeTabId: string | null;
  isAllTabActive: boolean;

  loadingIds: Set<MetricSourceId>;
  resultsByDefinitionId: Map<MetricSourceId, Dataset>;
  errorsByDefinitionId: Map<MetricSourceId, string>;
  isExecuting: (id: MetricSourceId) => boolean;

  sourceColors: SourceColorMap;
  selectedMetrics: SelectedMetric[];
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  availableDimensions: AvailableDimensionsResult;

  addMetric: (metric: SelectedMetric) => void;
  swapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  removeMetric: (id: number, sourceType: "metric" | "measure") => void;
  changeTab: (tabId: string) => void;
  addTab: (dimensionName: string) => void;
  removeTab: (tabId: string) => void;
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
    dimension: DimensionMetadata | undefined,
  ) => void;
}

const FIXED_TAB_IDS = new Set(
  TAB_TYPE_REGISTRY.filter((c) => c.fixedId).map((c) => c.fixedId!),
);

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
    setBreakoutDimension,
    initialize,
  } = useViewerState();

  const {
    resultsByDefinitionId,
    errorsByDefinitionId,
    isExecuting,
    executeForTab,
  } = useQueryExecutor();

  const latestState = useLatest(state);

  const definitionLoaderCallbacks = useMemo(
    () => ({
      addDefinition,
      updateDefinition,
      removeDefinition,
      replaceDefinition,
      addTab: addTabState,
    }),
    [
      addDefinition,
      updateDefinition,
      removeDefinition,
      replaceDefinition,
      addTabState,
    ],
  );

  const {
    loadingIds,
    loadAndAddMetric,
    loadAndAddMeasure,
    loadAndReplaceMetric,
    loadAndReplaceMeasure,
  } = useDefinitionLoader(latestState, definitionLoaderCallbacks);

  // ── URL integration ──

  const handleLoadSources = useCallback(
    (request: { metricIds: number[]; measureIds: number[] }) => {
      request.metricIds.forEach(loadAndAddMetric);
      request.measureIds.forEach(loadAndAddMeasure);
    },
    [loadAndAddMetric, loadAndAddMeasure],
  );

  useViewerUrl(state, initialize, handleLoadSources);

  // ── Derived state ──

  const selectedMetrics = useMemo(
    () => getSelectedMetricsInfo(state.definitions, loadingIds),
    [state.definitions, loadingIds],
  );

  const activeTab = useMemo((): MetricsViewerTabState | null => {
    if (state.selectedTabId === ALL_TAB_ID || state.tabs.length === 0) {
      return null;
    }
    return (
      state.tabs.find((t) => t.id === state.selectedTabId) ?? state.tabs[0]
    );
  }, [state.tabs, state.selectedTabId]);

  const sourceColors = useMemo(() => {
    const tab = activeTab ?? state.tabs[0];
    if (tab) {
      const modDefs = computeModifiedDefinitions(state.definitions, tab);
      const { series, cardIdsByDefinition } = buildRawSeriesFromDefinitions(
        state.definitions,
        tab,
        resultsByDefinitionId,
        modDefs,
      );

      if (series.length > 0) {
        const chartColors = computeColorsFromRawSeries(
          series,
          cardIdsByDefinition,
        );
        const hasMissingColors = state.definitions.some(
          (d) => chartColors[d.id] == null,
        );
        if (hasMissingColors) {
          const fallback = computeSourceColors(state.definitions);
          return { ...fallback, ...chartColors };
        }
        return chartColors;
      }
    }

    return computeSourceColors(state.definitions);
  }, [state.definitions, activeTab, state.tabs, resultsByDefinitionId]);

  const isAllTabActive =
    state.selectedTabId === ALL_TAB_ID && state.tabs.length > 1;

  const definitionsBySourceId = useMemo(
    () =>
      Object.fromEntries(
        state.definitions.map((e) => [e.id, e.definition]),
      ) as Record<MetricSourceId, MetricDefinition | null>,
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

  const effectiveTabs = useMemo(
    () =>
      state.tabs.map((tab) => {
        if (FIXED_TAB_IDS.has(tab.id)) {
          return tab;
        }
        const firstDef = tab.definitions[0];
        if (!firstDef?.projectionDimensionId) {
          return tab;
        }
        const def = definitionsBySourceId[firstDef.definitionId];
        if (!def) {
          return tab;
        }
        const dimsByType = getDimensionsByType(def);
        const dimInfo = dimsByType.get(firstDef.projectionDimensionId);
        return dimInfo ? { ...tab, label: dimInfo.displayName } : tab;
      }),
    [state.tabs, definitionsBySourceId],
  );

  const availableDimensions = useMemo(
    () =>
      getAvailableDimensionsForPicker(
        definitionsBySourceId,
        sourceOrder,
        existingTabIds,
      ),
    [definitionsBySourceId, sourceOrder, existingTabIds],
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
    (id: number, sourceType: "metric" | "measure") => {
      const sourceId =
        sourceType === "metric"
          ? createMetricSourceId(id)
          : createMeasureSourceId(id);
      removeDefinition(sourceId);
    },
    [removeDefinition],
  );

  const addTab = useCallback(
    (dimensionName: string) => {
      const newTab = createTabFromDimension(
        dimensionName,
        definitionsBySourceId,
        sourceOrder,
      );
      if (!newTab) {
        return;
      }

      addTabState(newTab);
      changeTab(newTab.id);
    },
    [definitionsBySourceId, sourceOrder, addTabState, changeTab],
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
    updateDefinition,
    setBreakoutDimension,
  };
}
