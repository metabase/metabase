import { useCallback, useMemo } from "react";

import { objectFromEntries } from "metabase/utils/objects";
import { isNotNull } from "metabase/utils/types";
import type {
  DimensionMetadata,
  MetricDefinition,
  ProjectionClause,
} from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  CardId,
  Dataset,
  MetricBreakoutValuesResponse,
  SingleSeries,
} from "metabase-types/api";

import type { MetricsViewerPageProps } from "../pages/MetricsViewerPage/MetricsViewerPage";
import type {
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  MetricsViewerTabState,
  SelectedMetric,
  SourceBreakoutColorMap,
  SourceColorMap,
} from "../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../types/viewer-state";
import { getDefinitionName } from "../utils/definition-builder";
import type {
  AvailableDimensionsResult,
  SourceDisplayInfo,
} from "../utils/dimension-picker";
import { getAvailableDimensionsForPicker } from "../utils/dimension-picker";
import { type MetricSlot, computeMetricSlots } from "../utils/metric-slots";
import {
  buildSeries,
  computeSourceBreakoutColors,
  getSelectedMetricsInfo,
} from "../utils/series";
import { createSourceId } from "../utils/source-ids";
import {
  type TabInfo,
  createTabFromTabInfo,
  recomputeTabLabels,
} from "../utils/tabs";

import { useDefinitionQueries } from "./use-definition-queries";
import { useViewerState } from "./use-viewer-state";
import { type LoadSourcesRequest, useViewerUrl } from "./use-viewer-url";

export interface UseMetricsViewerResult {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  tabs: MetricsViewerTabState[];
  activeTab: MetricsViewerTabState | null;
  activeTabId: string | null;
  initialLoadComplete: boolean;
  loadingIds: Set<MetricSourceId>;
  resultsByEntityIndex: Map<number, Dataset>;
  queriesAreLoading: boolean;
  queriesError: string | null;
  modifiedDefinitionsBySlotIndex: Map<number, MetricDefinition>;
  breakoutValuesByEntityIndex: Map<number, MetricBreakoutValuesResponse>;
  metricSlots: MetricSlot[];
  series: SingleSeries[];
  cardIdToEntityIndex: Record<CardId, number>;
  activeBreakoutColors: SourceBreakoutColorMap;
  sourceColors: SourceColorMap;
  selectedMetrics: SelectedMetric[];
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  availableDimensions: AvailableDimensionsResult;

  addMetric: (metric: SelectedMetric) => void;
  swapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  removeMetric: (id: number, sourceType: "metric" | "measure") => void;
  changeTab: (tabId: string) => void;
  addAndSelectTab: (tabInfo: TabInfo) => void;
  removeTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<MetricsViewerTabState>) => void;
  updateActiveTab: (updates: Partial<MetricsViewerTabState>) => void;
  changeTabDimension: (
    tabId: string,
    slotIndex: number,
    dimension: DimensionMetadata,
  ) => void;
  removeTabDimension: (tabId: string, slotIndex: number) => void;
  setBreakoutDimension: (
    entity: MetricDefinitionEntry,
    dimension: ProjectionClause | undefined,
  ) => void;
  setFormulaEntities: (
    entities: MetricsViewerFormulaEntity[],
    slotMapping?: Map<number, number>,
  ) => void;
}

export function useMetricsViewer({
  location,
}: MetricsViewerPageProps): UseMetricsViewerResult {
  const {
    state,
    loadingIds,
    initialLoadComplete,
    setInitialLoadComplete,
    removeDefinition,
    setFormulaEntities,
    selectTab: changeTab,
    addTab,
    removeTab,
    updateTab,
    setDefinitionDimension: changeTabDimension,
    removeDefinitionDimension: removeTabDimension,
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
        loadAndAddMetric(metricId);
      }
      for (const measureId of request.measureIds) {
        loadAndAddMeasure(measureId);
      }
    },
    [loadAndAddMetric, loadAndAddMeasure],
  );

  useViewerUrl(
    state,
    initialize,
    handleLoadSources,
    location,
    setFormulaEntities,
    setInitialLoadComplete,
  );

  const activeTab = useMemo((): MetricsViewerTabState | null => {
    if (state.tabs.length === 0) {
      return null;
    }
    return (
      state.tabs.find((tab) => tab.id === state.selectedTabId) ?? state.tabs[0]
    );
  }, [state.tabs, state.selectedTabId]);

  const {
    resultsByEntityIndex,
    queriesAreLoading,
    queriesError,
    modifiedDefinitionsBySlotIndex,
    breakoutValuesByEntityIndex,
  } = useDefinitionQueries(state.definitions, state.formulaEntities, activeTab);

  const definitionValues = useMemo(
    () => Object.values(state.definitions),
    [state.definitions],
  );

  const selectedMetrics = useMemo(
    () => getSelectedMetricsInfo(definitionValues, loadingIds),
    [definitionValues, loadingIds],
  );

  const metricSlots = useMemo(
    () => computeMetricSlots(state.formulaEntities),
    [state.formulaEntities],
  );

  const sourceBreakoutColors = useMemo(
    () =>
      computeSourceBreakoutColors(
        state.formulaEntities,
        state.definitions,
        breakoutValuesByEntityIndex,
      ),
    [state.formulaEntities, state.definitions, breakoutValuesByEntityIndex],
  );

  const { series, cardIdToEntityIndex, activeBreakoutColors } = useMemo(() => {
    if (!activeTab) {
      return { series: [], cardIdToEntityIndex: {}, activeBreakoutColors: {} };
    }
    return buildSeries({
      formulaEntities: state.formulaEntities,
      definitions: state.definitions,
      display: activeTab.display,
      resultsByEntityIndex,
      sourceBreakoutColors,
      extraVizSettings: activeTab.visualizationSettings,
    });
  }, [
    state.formulaEntities,
    state.definitions,
    activeTab,
    resultsByEntityIndex,
    sourceBreakoutColors,
  ]);

  const sourceColors = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(activeBreakoutColors).map(([sourceId, colors]) => [
          sourceId,
          colors === undefined
            ? []
            : typeof colors === "string"
              ? [colors]
              : Array.from(colors.values()),
        ]),
      ),
    [activeBreakoutColors],
  );

  const definitionsBySourceId = useMemo(
    () =>
      objectFromEntries(
        definitionValues.map((entry) => [entry.id, entry.definition] as const),
      ),
    [definitionValues],
  );

  const sourceOrder = useMemo(() => {
    const out: MetricSourceId[] = [];
    const seen = new Set<MetricSourceId>();
    for (const entry of state.formulaEntities) {
      if (isMetricEntry(entry) && !seen.has(entry.id)) {
        out.push(entry.id);
        seen.add(entry.id);
      }
      if (isExpressionEntry(entry)) {
        for (const token of entry.tokens) {
          if (token.type === "metric" && !seen.has(token.sourceId)) {
            out.push(token.sourceId);
            seen.add(token.sourceId);
          }
        }
      }
    }
    return out;
  }, [state.formulaEntities]);

  const sourceDataById = useMemo((): Record<
    MetricSourceId,
    SourceDisplayInfo
  > => {
    const result: Record<MetricSourceId, SourceDisplayInfo> = {};
    for (const entry of definitionValues) {
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
  }, [definitionValues]);

  const existingTabDimensionIds = useMemo(
    () =>
      new Set(
        state.tabs
          .flatMap((tab) => Object.values(tab.dimensionMapping))
          .filter(isNotNull),
      ),
    [state.tabs],
  );

  const effectiveTabs = useMemo(
    () => recomputeTabLabels(state.tabs, state.definitions, metricSlots),
    [state.tabs, metricSlots, state.definitions],
  );

  const availableDimensions = useMemo(
    () =>
      getAvailableDimensionsForPicker(
        definitionsBySourceId,
        sourceOrder,
        metricSlots,
        existingTabDimensionIds,
      ),
    [definitionsBySourceId, sourceOrder, metricSlots, existingTabDimensionIds],
  );

  const addMetric = useCallback(
    (metric: SelectedMetric) => {
      const sourceId = createSourceId(metric.id, metric.sourceType);

      if (sourceId in state.definitions) {
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
    (tabInfo: TabInfo) => {
      const newTab = createTabFromTabInfo(tabInfo);
      if (!newTab) {
        return;
      }

      addTab(newTab);
      changeTab(newTab.id);
    },
    [addTab, changeTab],
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

  return {
    definitions: state.definitions,
    formulaEntities: state.formulaEntities,
    tabs: effectiveTabs,
    activeTab,
    activeTabId: state.selectedTabId,
    initialLoadComplete,
    loadingIds,
    resultsByEntityIndex,
    queriesAreLoading,
    queriesError,
    modifiedDefinitionsBySlotIndex,
    breakoutValuesByEntityIndex,
    metricSlots,
    series,
    cardIdToEntityIndex,
    activeBreakoutColors,
    sourceColors,
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
    changeTabDimension,
    removeTabDimension,
    setBreakoutDimension,
    setFormulaEntities,
  };
}
