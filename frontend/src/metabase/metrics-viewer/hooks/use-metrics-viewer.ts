import { useCallback, useEffect, useMemo, useRef } from "react";

import { objectFromEntries } from "metabase/lib/objects";
import type {
  DimensionMetadata,
  MetricDefinition,
  ProjectionClause,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { Dataset, MetricBreakoutValuesResponse } from "metabase-types/api";

import { getDefinitionName } from "../adapters/definition-loader";
import { ALL_TAB_ID } from "../constants";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  SelectedMetric,
  SourceColorMap,
} from "../types/viewer-state";
import { findDimensionById } from "../utils/metrics";
import {
  computeSourceColors,
  entryHasBreakout,
  getSelectedMetricsInfo,
} from "../utils/series";
import { createSourceId } from "../utils/source-ids";
import { TAB_TYPE_REGISTRY } from "../utils/tab-config";
import {
  type AvailableDimensionsResult,
  type SourceDisplayInfo,
  createTabFromDimension,
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

const FIXED_TAB_IDS = new Set(
  TAB_TYPE_REGISTRY.filter((c) => c.fixedId).map((c) => c.fixedId!),
);

export function useMetricsViewer(): UseMetricsViewerResult {
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

  const pendingBreakoutsRef = useRef<Record<MetricSourceId, string>>({});

  const handleLoadSources = useCallback(
    (request: LoadSourcesRequest) => {
      if (request.breakoutBySourceId) {
        pendingBreakoutsRef.current = { ...request.breakoutBySourceId };
      }
      request.metricIds.forEach(loadAndAddMetric);
      request.measureIds.forEach(loadAndAddMeasure);
    },
    [loadAndAddMetric, loadAndAddMeasure],
  );

  useViewerUrl(state, initialize, handleLoadSources);

  useEffect(() => {
    const pending = pendingBreakoutsRef.current;
    if (Object.keys(pending).length === 0) {
      return;
    }

    for (const entry of state.definitions) {
      const uuid = pending[entry.id];
      if (!uuid || !entry.definition || entryHasBreakout(entry)) {
        continue;
      }
      const dimension = findDimensionById(entry.definition, uuid);
      if (dimension) {
        setBreakoutDimension(entry.id, LibMetric.dimensionReference(dimension));
      }
      delete pending[entry.id];
    }
  }, [state.definitions, setBreakoutDimension]);

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

  const effectiveTabs = useMemo(
    () =>
      state.tabs.map((tab) => {
        if (FIXED_TAB_IDS.has(tab.id)) {
          return tab;
        }
        const mappingEntries = Object.entries(tab.dimensionMapping);
        if (mappingEntries.length === 0) {
          return tab;
        }
        const [firstSourceId, firstDimensionId] = mappingEntries[0];
        const def = definitionsBySourceId[firstSourceId as MetricSourceId];
        if (!def) {
          return tab;
        }
        const dimsByType = getDimensionsByType(def);
        const dimInfo = dimsByType.get(firstDimensionId);
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
