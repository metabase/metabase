import { useCallback, useMemo } from "react";

import { objectFromEntries } from "metabase/utils/objects";
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
  MetricsViewerDimensionBreakoutState,
  MetricsViewerFormulaEntity,
  SelectedMetric,
  SourceBreakoutColorMap,
  SourceColorMap,
} from "../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../types/viewer-state";
import { getDefinitionName } from "../utils/definition-builder";
import {
  type DimensionBreakoutInfo,
  createDimensionBreakoutFromInfo,
  recomputeDimensionBreakoutLabels,
} from "../utils/dimension-breakouts";
import type {
  AvailableDimensionsResult,
  SourceDisplayInfo,
} from "../utils/dimension-picker";
import {
  getAvailableDimensionsForPicker,
  getExistingDimensionBreakoutDimensionIds,
} from "../utils/dimension-picker";
import { type MetricSlot, computeMetricSlots } from "../utils/metric-slots";
import {
  buildSeries,
  computeSourceBreakoutColors,
  getSelectedMetricsInfo,
} from "../utils/series";
import { createSourceId } from "../utils/source-ids";

import { useDefinitionQueries } from "./use-definition-queries";
import { useViewerState } from "./use-viewer-state";
import { type LoadSourcesRequest, useViewerUrl } from "./use-viewer-url";

export interface UseMetricsViewerResult {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  dimensionBreakouts: MetricsViewerDimensionBreakoutState[];
  activeDimensionBreakout: MetricsViewerDimensionBreakoutState | null;
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
  activeDimensionBreakoutAvailableDimensions: AvailableDimensionsResult;
  sidebarAvailableDimensions: AvailableDimensionsResult;

  addMetric: (metric: SelectedMetric) => void;
  swapMetric: (oldMetric: SelectedMetric, newMetric: SelectedMetric) => void;
  removeMetric: (id: number, sourceType: "metric" | "measure") => void;
  selectDimensionBreakout: (
    dimensionBreakoutInfo: DimensionBreakoutInfo,
  ) => void;
  updateActiveDimensionBreakout: (
    updates: Partial<MetricsViewerDimensionBreakoutState>,
  ) => void;
  changeDimensionBreakoutDimension: (
    dimensionBreakoutId: string,
    slotIndex: number,
    dimension: DimensionMetadata,
  ) => void;
  removeDimensionBreakoutDimension: (
    dimensionBreakoutId: string,
    slotIndex: number,
  ) => void;
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
    selectDimensionBreakoutById,
    addDimensionBreakout,
    updateDimensionBreakout,
    setDefinitionDimension: changeDimensionBreakoutDimension,
    removeDefinitionDimension: removeDimensionBreakoutDimension,
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

  const activeDimensionBreakout =
    useMemo((): MetricsViewerDimensionBreakoutState | null => {
      if (state.dimensionBreakouts.length === 0) {
        return null;
      }
      return (
        state.dimensionBreakouts.find(
          (dimensionBreakout) =>
            dimensionBreakout.id === state.selectedDimensionBreakoutId,
        ) ?? state.dimensionBreakouts[0]
      );
    }, [state.dimensionBreakouts, state.selectedDimensionBreakoutId]);

  const {
    resultsByEntityIndex,
    queriesAreLoading,
    queriesError,
    modifiedDefinitionsBySlotIndex,
    breakoutValuesByEntityIndex,
  } = useDefinitionQueries(
    state.definitions,
    state.formulaEntities,
    activeDimensionBreakout,
  );

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
    if (!activeDimensionBreakout) {
      return { series: [], cardIdToEntityIndex: {}, activeBreakoutColors: {} };
    }
    return buildSeries({
      formulaEntities: state.formulaEntities,
      definitions: state.definitions,
      display: activeDimensionBreakout.display,
      resultsByEntityIndex,
      sourceBreakoutColors,
      extraVizSettings: activeDimensionBreakout.visualizationSettings,
    });
  }, [
    state.formulaEntities,
    state.definitions,
    activeDimensionBreakout,
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

  const existingDimensionBreakoutDimensionIds = useMemo(
    () => getExistingDimensionBreakoutDimensionIds(state.dimensionBreakouts),
    [state.dimensionBreakouts],
  );

  const existingNonActiveDimensionBreakoutDimensionIds = useMemo(
    () =>
      getExistingDimensionBreakoutDimensionIds(
        state.dimensionBreakouts,
        activeDimensionBreakout?.id,
      ),
    [state.dimensionBreakouts, activeDimensionBreakout?.id],
  );

  const effectiveDimensionBreakouts = useMemo(
    () =>
      recomputeDimensionBreakoutLabels(
        state.dimensionBreakouts,
        state.definitions,
        metricSlots,
      ),
    [state.dimensionBreakouts, metricSlots, state.definitions],
  );

  const availableDimensions = useMemo(
    () =>
      getAvailableDimensionsForPicker(
        definitionsBySourceId,
        sourceOrder,
        metricSlots,
        existingDimensionBreakoutDimensionIds,
      ),
    [
      definitionsBySourceId,
      sourceOrder,
      metricSlots,
      existingDimensionBreakoutDimensionIds,
    ],
  );

  const activeDimensionBreakoutAvailableDimensions = useMemo(
    () =>
      getAvailableDimensionsForPicker(
        definitionsBySourceId,
        sourceOrder,
        metricSlots,
        existingNonActiveDimensionBreakoutDimensionIds,
      ),
    [
      definitionsBySourceId,
      sourceOrder,
      metricSlots,
      existingNonActiveDimensionBreakoutDimensionIds,
    ],
  );

  const sidebarAvailableDimensions = useMemo(
    () =>
      getAvailableDimensionsForPicker(
        definitionsBySourceId,
        sourceOrder,
        metricSlots,
        new Set(),
      ),
    [definitionsBySourceId, sourceOrder, metricSlots],
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

  const selectDimensionBreakout = useCallback(
    (dimensionBreakoutInfo: DimensionBreakoutInfo) => {
      const newDimensionBreakout = createDimensionBreakoutFromInfo(
        dimensionBreakoutInfo,
      );
      if (!newDimensionBreakout) {
        return;
      }

      addDimensionBreakout(newDimensionBreakout);
      selectDimensionBreakoutById(newDimensionBreakout.id);
    },
    [addDimensionBreakout, selectDimensionBreakoutById],
  );

  const updateActiveDimensionBreakout = useCallback(
    (updates: Partial<MetricsViewerDimensionBreakoutState>) => {
      if (!activeDimensionBreakout) {
        return;
      }
      updateDimensionBreakout(activeDimensionBreakout.id, updates);
    },
    [activeDimensionBreakout, updateDimensionBreakout],
  );

  return {
    definitions: state.definitions,
    formulaEntities: state.formulaEntities,
    dimensionBreakouts: effectiveDimensionBreakouts,
    activeDimensionBreakout,
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
    activeDimensionBreakoutAvailableDimensions,
    sidebarAvailableDimensions,

    addMetric,
    swapMetric,
    removeMetric,
    selectDimensionBreakout,
    updateActiveDimensionBreakout,
    changeDimensionBreakoutDimension,
    removeDimensionBreakoutDimension,
    setBreakoutDimension,
    setFormulaEntities,
  };
}
