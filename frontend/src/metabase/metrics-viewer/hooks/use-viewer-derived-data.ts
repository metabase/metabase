import { useMemo } from "react";

import { objectFromEntries } from "metabase/utils/objects";
import * as LibMetric from "metabase-lib/metric";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDimensionBreakoutState,
  MetricsViewerFormulaEntity,
  SourceDisplayInfo,
  UseViewerStateResult,
} from "../types/viewer-state";
import { isExpressionEntry, isMetricEntry } from "../types/viewer-state";
import { getDefinitionName } from "../utils/definition-builder";
import {
  getAvailableDimensionsForPicker,
  getExistingDimensionBreakoutDimensionIds,
} from "../utils/dimension-picker";
import { computeMetricSlots } from "../utils/metric-slots";
import {
  buildSeries,
  computeSourceBreakoutColors,
  getSelectedMetricsInfo,
} from "../utils/series";

import { useDefinitionQueries } from "./use-definition-queries";

type UseViewerDerivedDataInput = {
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  dimensionBreakouts: MetricsViewerDimensionBreakoutState[];
  selectedDimensionBreakoutId: string | null;
  loadingIds: Set<MetricSourceId>;
};

type UseViewerDerivedDataResult = Pick<
  UseViewerStateResult,
  | "activeDimensionBreakout"
  | "queriesAreLoading"
  | "queriesError"
  | "modifiedDefinitionsBySlotIndex"
  | "metricSlots"
  | "series"
  | "cardIdToEntityIndex"
  | "activeBreakoutColors"
  | "sourceColors"
  | "selectedMetrics"
  | "sourceOrder"
  | "sourceDataById"
  | "availableDimensions"
  | "sidebarAvailableDimensions"
>;

export function useViewerDerivedData({
  definitions,
  formulaEntities,
  dimensionBreakouts,
  selectedDimensionBreakoutId,
  loadingIds,
}: UseViewerDerivedDataInput): UseViewerDerivedDataResult {
  const activeDimensionBreakout = useMemo(() => {
    if (dimensionBreakouts.length === 0) {
      return null;
    }
    return (
      dimensionBreakouts.find(
        (dimensionBreakout) =>
          dimensionBreakout.id === selectedDimensionBreakoutId,
      ) ?? dimensionBreakouts[0]
    );
  }, [dimensionBreakouts, selectedDimensionBreakoutId]);

  const {
    resultsByEntityIndex,
    queriesAreLoading,
    queriesError,
    modifiedDefinitionsBySlotIndex,
    breakoutValuesByEntityIndex,
  } = useDefinitionQueries(
    definitions,
    formulaEntities,
    activeDimensionBreakout,
  );

  const definitionValues = useMemo(
    () => Object.values(definitions),
    [definitions],
  );

  const selectedMetrics = useMemo(
    () => getSelectedMetricsInfo(definitionValues, loadingIds),
    [definitionValues, loadingIds],
  );

  const metricSlots = useMemo(
    () => computeMetricSlots(formulaEntities),
    [formulaEntities],
  );

  const sourceBreakoutColors = useMemo(
    () =>
      computeSourceBreakoutColors(
        formulaEntities,
        definitions,
        breakoutValuesByEntityIndex,
      ),
    [formulaEntities, definitions, breakoutValuesByEntityIndex],
  );

  const { series, cardIdToEntityIndex, activeBreakoutColors } = useMemo(() => {
    if (!activeDimensionBreakout) {
      return { series: [], cardIdToEntityIndex: {}, activeBreakoutColors: {} };
    }
    return buildSeries({
      formulaEntities,
      definitions,
      display: activeDimensionBreakout.display,
      resultsByEntityIndex,
      sourceBreakoutColors,
      extraVizSettings: activeDimensionBreakout.visualizationSettings,
    });
  }, [
    formulaEntities,
    definitions,
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
    for (const entry of formulaEntities) {
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
  }, [formulaEntities]);

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

  const existingNonActiveDimensionBreakoutDimensionIds = useMemo(
    () =>
      getExistingDimensionBreakoutDimensionIds(
        dimensionBreakouts,
        activeDimensionBreakout?.id,
      ),
    [dimensionBreakouts, activeDimensionBreakout?.id],
  );

  const availableDimensions = useMemo(
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

  return useMemo(
    () => ({
      activeDimensionBreakout,
      queriesAreLoading,
      queriesError,
      modifiedDefinitionsBySlotIndex,
      metricSlots,
      series,
      cardIdToEntityIndex,
      activeBreakoutColors,
      sourceColors,
      selectedMetrics,
      sourceOrder,
      sourceDataById,
      availableDimensions,
      sidebarAvailableDimensions,
    }),
    [
      activeDimensionBreakout,
      queriesAreLoading,
      queriesError,
      modifiedDefinitionsBySlotIndex,
      metricSlots,
      series,
      cardIdToEntityIndex,
      activeBreakoutColors,
      sourceColors,
      selectedMetrics,
      sourceOrder,
      sourceDataById,
      availableDimensions,
      sidebarAvailableDimensions,
    ],
  );
}
