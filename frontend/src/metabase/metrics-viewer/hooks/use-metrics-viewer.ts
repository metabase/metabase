import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";

import { useDispatch, useStore } from "metabase/lib/redux";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { Dataset, MeasureId } from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import {
  getDefinitionName,
  loadMeasureDefinition,
  loadMetricDefinition,
} from "../adapters/definition-loader";
import { ALL_TAB_ID } from "../constants";
import type {
  DefinitionId,
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
  computeDefaultTabs,
  createTabFromDimension,
  getAvailableDimensionsForPicker,
  getDimensionsByType,
} from "../utils/tabs";

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

  sourceColors: SourceColorMap;
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
  updateDefinition: (id: DefinitionId, definition: MetricDefinition) => void;
}

const FIXED_TAB_IDS = new Set(
  TAB_TYPE_REGISTRY.filter((c) => c.fixedId).map((c) => c.fixedId!),
);

export function useMetricsViewer(): UseMetricsViewerResult {
  const dispatch = useDispatch();
  const store = useStore();

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
    resultsByDefinitionId,
    errorsByDefinitionId,
    isExecuting,
    executeForTab,
  } = useQueryExecutor();

  // ── Definition loading (inlined from use-definition-loader) ──

  const latestState = useLatest(state);
  const loadingRef = useRef<Set<DefinitionId>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<DefinitionId>>(new Set());

  const loadDefinition = useCallback(
    async (id: DefinitionId, loader: () => Promise<MetricDefinition>) => {
      if (loadingRef.current.has(id)) {
        return;
      }

      loadingRef.current.add(id);
      setLoadingIds((prev) => new Set(prev).add(id));
      addDefinition({ id, definition: null });

      try {
        const definition = await loader();
        updateDefinition(id, definition);

        if (latestState.current.tabs.length === 0) {
          const definitions: Record<MetricSourceId, MetricDefinition | null> = {
            [id]: definition,
          };
          for (const tab of computeDefaultTabs(definitions, [
            id as MetricSourceId,
          ])) {
            addTabState(tab);
          }
        }
      } catch {
        removeDefinition(id);
      } finally {
        loadingRef.current.delete(id);
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [
      addDefinition,
      updateDefinition,
      removeDefinition,
      addTabState,
      latestState,
    ],
  );

  const loadAndReplace = useCallback(
    async (
      oldSourceId: MetricSourceId,
      newId: MetricSourceId,
      loader: () => Promise<MetricDefinition>,
    ) => {
      if (loadingRef.current.has(newId)) {
        return;
      }

      loadingRef.current.add(newId);
      setLoadingIds((prev) => new Set(prev).add(newId));
      replaceDefinition(oldSourceId, { id: newId, definition: null });

      try {
        const definition = await loader();
        updateDefinition(newId, definition);
      } catch {
        removeDefinition(newId);
      } finally {
        loadingRef.current.delete(newId);
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(newId);
          return next;
        });
      }
    },
    [replaceDefinition, updateDefinition, removeDefinition],
  );

  const loadAndAddMetric = useCallback(
    (metricId: MetricId) =>
      loadDefinition(createMetricSourceId(metricId), () =>
        loadMetricDefinition(dispatch, store.getState, metricId),
      ),
    [loadDefinition, dispatch, store],
  );

  const loadAndAddMeasure = useCallback(
    (measureId: MeasureId) =>
      loadDefinition(createMeasureSourceId(measureId), () =>
        loadMeasureDefinition(dispatch, store.getState, measureId),
      ),
    [loadDefinition, dispatch, store],
  );

  const loadAndReplaceMetric = useCallback(
    (oldSourceId: MetricSourceId, metricId: MetricId) =>
      loadAndReplace(oldSourceId, createMetricSourceId(metricId), () =>
        loadMetricDefinition(dispatch, store.getState, metricId),
      ),
    [loadAndReplace, dispatch, store],
  );

  const loadAndReplaceMeasure = useCallback(
    (oldSourceId: MetricSourceId, measureId: MeasureId) =>
      loadAndReplace(oldSourceId, createMeasureSourceId(measureId), () =>
        loadMeasureDefinition(dispatch, store.getState, measureId),
      ),
    [loadAndReplace, dispatch, store],
  );

  // ── URL integration ──

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

  const sourceColors = useMemo(() => {
    if (!activeTab) {
      return computeSourceColors(state.definitions);
    }

    const modDefs = computeModifiedDefinitions(state.definitions, activeTab);
    const rawSeries = buildRawSeriesFromDefinitions(
      state.definitions,
      activeTab,
      resultsByDefinitionId,
      modDefs,
    );

    if (rawSeries.length > 0) {
      const chartColors = computeColorsFromRawSeries(rawSeries);
      if (state.definitions.length > rawSeries.length) {
        const fallback = computeSourceColors(state.definitions);
        return { ...fallback, ...chartColors };
      }
      return chartColors;
    }

    return computeSourceColors(state.definitions);
  }, [state.definitions, activeTab, resultsByDefinitionId]);

  const isAllTabActive =
    state.selectedTabId === ALL_TAB_ID && state.tabs.length > 1;

  const definitionsBySourceId = useMemo(() => {
    const defs: Record<MetricSourceId, MetricDefinition | null> = {};
    for (const entry of state.definitions) {
      defs[entry.id] = entry.definition;
    }
    return defs;
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
        const def =
          definitionsBySourceId[firstDef.definitionId as MetricSourceId];
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
    updateDefinition,
  };
}
