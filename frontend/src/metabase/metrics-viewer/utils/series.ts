import { t } from "ttag";

import type { DimensionOption } from "metabase/common/components/DimensionPill";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";
import type {
  DimensionPillBarItem,
  ExpressionDimensionItem,
  ExpressionMetricSource,
  MetricDimensionItem,
} from "metabase/metrics-viewer/components/DimensionPillBar";
import { getColorsForValues } from "metabase/ui/colors/charts";
import { getColorplethColorScale } from "metabase/visualizations/components/ChoroplethMap";
import { MAX_SERIES } from "metabase/visualizations/lib/utils";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  Card,
  CardId,
  Dataset,
  DatasetColumn,
  DimensionId,
  MetricBreakoutValuesResponse,
  RowValue,
  RowValues,
  SingleSeries,
  TemporalUnit,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

import {
  type BreakoutColorMap,
  type ExpressionDefinitionEntry,
  type MetricDefinitionEntry,
  type MetricSourceId,
  type MetricsViewerDefinitionEntry,
  type MetricsViewerDisplayType,
  type MetricsViewerFormulaEntity,
  type SelectedMetric,
  type SourceBreakoutColorMap,
  type SourceColorMap,
  isExpressionEntry,
  isMetricEntry,
} from "../types/viewer-state";

import { getDefinitionName } from "./definition-builder";
import { getModifiedDefinition } from "./definition-cache";
import {
  entryHasBreakout,
  getEffectiveDefinitionEntry,
  getEntryBreakout,
} from "./definition-entries";
import { findDimensionById } from "./dimension-lookup";
import { type MetricSlot, slotsForEntity } from "./metric-slots";
import { nextSyntheticCardId, parseSourceId } from "./source-ids";
import { DISPLAY_TYPE_REGISTRY } from "./tab-config";
import { getDimensionIcon } from "./tabs";

interface BuildSeriesParams {
  formulaEntities: MetricsViewerFormulaEntity[];
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  resultsByEntityIndex: Map<number, Dataset>;
  metricSlots: MetricSlot[];
  dimensionMapping: Record<number, DimensionId | null>;
  display: MetricsViewerDisplayType;
  modifiedDefinitionsBySlotIndex: Map<number, MetricDefinition>;
  sourceBreakoutColors: SourceBreakoutColorMap;
}

export function buildSeries({
  formulaEntities,
  definitions,
  resultsByEntityIndex,
  metricSlots,
  dimensionMapping,
  display,
  modifiedDefinitionsBySlotIndex,
  sourceBreakoutColors,
}: BuildSeriesParams): {
  series: SingleSeries[];
  cardIdToEntityIndex: Record<CardId, number>;
  activeBreakoutColors: SourceBreakoutColorMap;
} {
  const uniqueNamesByEntityIndex = computeUniqueEntityNames(
    formulaEntities,
    definitions,
  );
  let isFirstSeries = true;
  const cardIdToEntityIndex: Record<CardId, number> = {};
  const activeBreakoutColors: SourceBreakoutColorMap = {};

  const series = Array.from(resultsByEntityIndex.entries()).flatMap(
    ([entityIndex, result]) => {
      const vizSettings = getVizSettings(
        dimensionMapping,
        display,
        modifiedDefinitionsBySlotIndex,
        metricSlots
          .filter((slot) => slot.entityIndex === entityIndex)
          .map((slot) => slot.slotIndex),
      );
      if (!vizSettings) {
        return [];
      }
      const cardId = nextSyntheticCardId();
      const name = uniqueNamesByEntityIndex.get(entityIndex);
      if (!name) {
        return [];
      }
      const seriesKey = isFirstSeries ? result.data.cols[1]?.name : name;
      const colors = sourceBreakoutColors[entityIndex];
      const color =
        typeof colors === "string"
          ? colors
          : colors instanceof Map
            ? colors.values().next().value
            : undefined;
      const singleSeries: SingleSeries = {
        card: createSeriesCard(cardId, name, display, {
          ...vizSettings,
          ...computeColorVizSettings({
            displayType: display,
            seriesKey,
            color,
          }),
        }),
        data: result.data,
      };
      let entrySeries: SingleSeries[];
      const entity = formulaEntities[entityIndex];
      if (
        !isMetricEntry(entity) ||
        !entryHasBreakout(getEffectiveDefinitionEntry(entity, definitions)) ||
        singleSeries.data.rows.length === 0 ||
        !(colors instanceof Map)
      ) {
        entrySeries = [singleSeries];
        activeBreakoutColors[entityIndex] = color;
      } else {
        const { series, activeBreakoutColorMap } = splitByBreakout(
          singleSeries,
          formulaEntities.length,
          isFirstSeries,
          colors,
          vizSettings,
        );
        entrySeries = series;
        activeBreakoutColors[entityIndex] = activeBreakoutColorMap;
      }
      isFirstSeries = false;

      for (const series of entrySeries) {
        cardIdToEntityIndex[series.card.id] = entityIndex;
      }
      return entrySeries;
    },
  );

  const displayType = DISPLAY_TYPE_REGISTRY[display];
  if (series.length > 1 && displayType.combineSettings) {
    series[0].card.visualization_settings = displayType.combineSettings(
      series.map((s) => s.card.visualization_settings),
    );
  }

  return { series, cardIdToEntityIndex, activeBreakoutColors };
}

function getVizSettings(
  dimensionMapping: Record<number, DimensionId | null>,
  display: MetricsViewerDisplayType,
  modifiedDefinitionsBySlotIndex: Map<number, MetricDefinition>,
  slotIndices: number[],
): VisualizationSettings | null {
  const displayConfig = DISPLAY_TYPE_REGISTRY[display];
  for (const slotIndex of slotIndices) {
    const modifiedDefinition = modifiedDefinitionsBySlotIndex.get(slotIndex);
    if (!modifiedDefinition) {
      continue;
    }
    const dimensionId = dimensionMapping[slotIndex];
    if (displayConfig.dimensionRequired) {
      if (!dimensionId) {
        continue;
      }
      const dimension = findDimensionById(modifiedDefinition, dimensionId);
      if (!dimension) {
        continue;
      }
      return displayConfig.getSettings(modifiedDefinition, dimension);
    }
    return displayConfig.getSettings(modifiedDefinition);
  }
  return null;
}

/**
 * Compute unique display names for each formula entity, disambiguating
 * duplicate names by appending " (N)" starting from the second occurrence.
 * This ensures that `card.name` (used by `keyForSingleSeries` for color
 * resolution) is unique for each entity.
 */
export function computeUniqueEntityNames(
  formulaEntities: MetricsViewerFormulaEntity[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
): Map<number, string> {
  const rawNames: { entityIndex: number; name: string }[] = [];
  const totalCounts = new Map<string, number>();

  formulaEntities.forEach((entity, index) => {
    let name;
    if (isMetricEntry(entity)) {
      const effectiveDef = getEffectiveDefinitionEntry(entity, definitions);
      if (effectiveDef?.definition) {
        name = getDefinitionName(effectiveDef.definition);
        if (name) {
          rawNames.push({ entityIndex: index, name });
        }
      }
    } else if (isExpressionEntry(entity)) {
      name = entity.name;
      rawNames.push({ entityIndex: index, name: entity.name });
    }

    if (name) {
      totalCounts.set(name, (totalCounts.get(name) ?? 0) + 1);
    }
  });

  // Assign unique names: first occurrence keeps original, subsequent get " (N)"
  const result = new Map<number, string>();
  const seenCounts = new Map<string, number>();
  for (const { entityIndex, name } of rawNames) {
    const occurrence = (seenCounts.get(name) ?? 0) + 1;
    seenCounts.set(name, occurrence);
    if ((totalCounts.get(name) ?? 0) > 1 && occurrence > 1) {
      result.set(entityIndex, `${name} (${occurrence})`);
    } else {
      result.set(entityIndex, name);
    }
  }

  return result;
}

function formatBreakoutValue(value: RowValue, column: DatasetColumn): string {
  return String(
    formatValue(isEmpty(value) ? NULL_DISPLAY_VALUE : value, {
      column,
    }),
  );
}

export function computeSourceBreakoutColors(
  formulaEntities: MetricsViewerFormulaEntity[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  breakoutValuesByEntityIndex?: Map<number, MetricBreakoutValuesResponse>,
): SourceBreakoutColorMap {
  const uniqueNames = computeUniqueEntityNames(formulaEntities, definitions);

  const entries: {
    entityIndex: number;
    keys: string[];
    keyToBreakoutValue: Record<string, string>;
  }[] = [];

  for (
    let entityIndex = 0;
    entityIndex < formulaEntities.length;
    entityIndex++
  ) {
    const entity = formulaEntities[entityIndex];
    const uniqueName = uniqueNames.get(entityIndex);
    if (!uniqueName) {
      continue;
    }

    if (isMetricEntry(entity)) {
      const effectiveDef = getEffectiveDefinitionEntry(entity, definitions);
      if (!effectiveDef?.definition) {
        continue;
      }

      const response = breakoutValuesByEntityIndex?.get(entityIndex);
      if (
        entryHasBreakout(effectiveDef) &&
        response &&
        response.values.length > 0
      ) {
        // getColorsForValues needs unique keys
        const keys: string[] = [];
        // but we want to return the (possibly non-unique) breakout values to be displayed in the legend
        const keyToBreakoutValue: Record<string, string> = {};
        response.values.forEach((val) => {
          const breakoutValue = formatBreakoutValue(val, response.col);
          const key = `${uniqueName}: ${breakoutValue}`;
          keys.push(key);
          keyToBreakoutValue[key] = breakoutValue;
        });
        entries.push({ entityIndex, keys, keyToBreakoutValue });
      } else {
        entries.push({
          entityIndex,
          keys: [uniqueName],
          keyToBreakoutValue: {},
        });
      }
    }

    if (isExpressionEntry(entity)) {
      entries.push({ entityIndex, keys: [uniqueName], keyToBreakoutValue: {} });
    }
  }

  if (entries.length === 0) {
    return {};
  }

  const colorMapping = getColorsForValues(
    entries.flatMap((entry) => entry.keys),
  );

  const result: SourceBreakoutColorMap = {};
  for (const entry of entries) {
    if (entry.keys.length === 1) {
      result[entry.entityIndex] = colorMapping[entry.keys[0]];
    } else {
      result[entry.entityIndex] = new Map(
        Object.entries(entry.keyToBreakoutValue).map(([key, breakoutValue]) => [
          breakoutValue,
          colorMapping[key],
        ]),
      );
    }
  }
  return result;
}

// Column layout with breakout:
// - 3 cols when dimension != breakout: [dimension, breakout, metric] → output: [dimension, metric]
// - 2 cols when dimension == breakout: [breakout, metric] → output: [breakout, metric]
export function splitByBreakout(
  series: SingleSeries,
  seriesCount: number,
  isFirstSeries: boolean,
  breakoutColorMap: BreakoutColorMap,
  vizSettings: VisualizationSettings,
): {
  series: SingleSeries[];
  activeBreakoutColorMap: BreakoutColorMap | string | undefined;
} {
  const { card, data } = series;
  const { cols } = data;

  const hasSeparateDimension = cols.length === 3;
  const breakoutColumnIndex = hasSeparateDimension ? 1 : 0;
  const metricColumnIndex = hasSeparateDimension ? 2 : 1;
  const breakoutCol = cols[breakoutColumnIndex];
  const metricCol = cols[metricColumnIndex];
  const outputCols = [cols[0], metricCol];

  const rowsByBreakoutValue = new Map<RowValue, RowValues[]>();

  for (const row of data.rows) {
    const breakoutValue = formatBreakoutValue(
      row[breakoutColumnIndex],
      breakoutCol,
    );
    let groupedRows = rowsByBreakoutValue.get(breakoutValue);
    if (!groupedRows) {
      groupedRows = [];
      rowsByBreakoutValue.set(breakoutValue, groupedRows);
      if (rowsByBreakoutValue.size > MAX_SERIES) {
        return {
          series: [series],
          activeBreakoutColorMap: breakoutColorMap.values().next().value,
        };
      }
    }
    groupedRows.push([row[0], row[metricColumnIndex]] as RowValues);
  }

  const activeBreakoutColorMap: BreakoutColorMap = new Map();

  const breakoutSeries = Array.from(breakoutColorMap)
    .map(([breakoutValue, color]) => {
      const rows = rowsByBreakoutValue.get(breakoutValue);
      if (!rows) {
        return null;
      }

      activeBreakoutColorMap.set(breakoutValue, color);

      const name = [seriesCount > 1 && card.name, breakoutValue]
        .filter(Boolean)
        .join(": ");

      const seriesKey = isFirstSeries ? metricCol?.name : name;
      isFirstSeries = false;

      return {
        ...series,
        card: {
          ...card,
          id: nextSyntheticCardId(),
          name,
          visualization_settings: {
            ...vizSettings,
            ...computeColorVizSettings({
              displayType: card.display,
              seriesKey,
              color,
            }),
          },
        },
        data: {
          ...data,
          rows,
          cols: outputCols,
        },
      };
    })
    .filter((s) => s != null);
  return { series: breakoutSeries, activeBreakoutColorMap };
}

function createSeriesCard(
  id: number,
  name: string | null,
  display: string,
  vizSettings: VisualizationSettings,
): Card {
  return {
    id,
    name,
    display,
    visualization_settings: vizSettings,
  } as Card;
}

function computeColorVizSettings({
  displayType,
  seriesKey,
  color,
}: {
  displayType: VisualizationDisplay;
  seriesKey: string;
  color: string | undefined;
}): Partial<
  Pick<VisualizationSettings, "series_settings" | "map.colors" | "scalar.color">
> {
  if (color == null) {
    return {};
  }
  if (displayType === "map") {
    return {
      "map.colors": getColorplethColorScale(color),
    };
  } else if (displayType === "scalar") {
    return {
      "scalar.color": color,
    };
  } else {
    return {
      series_settings: {
        [seriesKey]: {
          color,
        },
      },
    };
  }
}

function computeAvailableOptions(
  entry: MetricsViewerDefinitionEntry,
  modifiedDefinition: MetricDefinition | undefined,
  dimensionFilter?: (dimension: LibMetric.DimensionMetadata) => boolean,
): DimensionOption[] {
  if (!entry.definition) {
    return [];
  }
  const definition = modifiedDefinition ?? entry.definition;
  const dimensions = LibMetric.projectionableDimensions(definition);
  const filtered = dimensionFilter
    ? dimensions.filter(dimensionFilter)
    : dimensions;

  const breakoutProjection = getEntryBreakout(entry);
  const breakoutRawDimension = breakoutProjection
    ? LibMetric.projectionDimension(entry.definition, breakoutProjection)
    : undefined;

  return filtered.flatMap((dimension) => {
    const info = LibMetric.displayInfo(definition, dimension);
    if (!info.name) {
      return [];
    }
    const isBreakout =
      breakoutRawDimension != null &&
      LibMetric.isSameSource(dimension, breakoutRawDimension);
    return [
      {
        name: info.name,
        displayName: info.displayName,
        icon: getDimensionIcon(dimension),
        dimension,
        group: info.group,
        selected: !isBreakout && (info.projectionPositions?.length ?? 0) > 0,
      },
    ];
  });
}

/**
 * Builds dimension items for the pill bar. Standalone metrics produce one
 * `DimensionItem` each. Expression entities produce one
 * `ExpressionDimensionItem` that groups all constituent metric-token slots
 * into a single pill with per-metric accordion sections.
 */
export function buildDimensionItemsFromDefinitions(
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  dimensionMapping: Record<number, DimensionId | null>,
  modifiedDefinitionsBySlotIndex: Map<number, MetricDefinition>,
  sourceColors: SourceColorMap,
  metricSlots: MetricSlot[],
  formulaEntities: MetricsViewerFormulaEntity[],
  projectionConfig: { temporalUnit?: TemporalUnit; binningStrategy?: string },
  dimensionFilter?: (dimension: LibMetric.DimensionMetadata) => boolean,
): DimensionPillBarItem[] {
  const items: DimensionPillBarItem[] = [];

  // Track which entity indices we've already emitted items for.
  const processedEntityIndices = new Set<number>();

  for (const slot of metricSlots) {
    // Skip if we already processed this entity index.
    if (processedEntityIndices.has(slot.entityIndex)) {
      continue;
    }

    const entity = formulaEntities[slot.entityIndex];

    if (isExpressionEntry(entity)) {
      // Expression entity — gather all token slots for this entity and
      // produce a single ExpressionDimensionItem.
      processedEntityIndices.add(slot.entityIndex);

      const entitySlots = slotsForEntity(metricSlots, slot.entityIndex);
      const metricSources = buildExpressionMetricSources(
        entitySlots,
        definitions,
        dimensionMapping,
        sourceColors,
        projectionConfig,
        entity,
        dimensionFilter,
      );

      // Derive aggregate label from selected dimensions.
      const selectedLabels = metricSources
        .map((s) => s.currentDimensionLabel)
        .filter(Boolean);
      const uniqueLabels = [...new Set(selectedLabels)];
      const label =
        uniqueLabels.length === 1
          ? uniqueLabels[0]
          : uniqueLabels.length > 1
            ? t`Multiple dimensions`
            : undefined;

      // Merge colors from all token slots for the pill indicator.
      const expressionColors = sourceColors[slot.entityIndex];

      items.push({
        type: "expression",
        id: slot.entityIndex,
        colors: expressionColors,
        label,
        metricSources,
      } satisfies ExpressionDimensionItem);
    }

    if (isMetricEntry(entity)) {
      processedEntityIndices.add(slot.entityIndex);

      const item = buildStandaloneDimensionItem(
        entity,
        slot,
        definitions,
        dimensionMapping,
        modifiedDefinitionsBySlotIndex,
        sourceColors,
        dimensionFilter,
      );
      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}

function buildStandaloneDimensionItem(
  entity: MetricDefinitionEntry,
  slot: MetricSlot,
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  dimensionMapping: Record<number, DimensionId | null>,
  modifiedDefinitionsBySlotIndex: Map<number, MetricDefinition>,
  sourceColors: SourceColorMap,
  dimensionFilter?: (dimension: LibMetric.DimensionMetadata) => boolean,
): MetricDimensionItem | null {
  const defEntry = getEffectiveDefinitionEntry(entity, definitions);
  if (!defEntry?.definition) {
    return null;
  }

  const effectiveEntry: MetricsViewerDefinitionEntry = {
    id: slot.sourceId,
    definition: defEntry.definition,
  };

  const dimensionId = dimensionMapping[slot.slotIndex];
  const entryColors = sourceColors[slot.entityIndex];
  const modifiedDefinition = modifiedDefinitionsBySlotIndex.get(slot.slotIndex);

  if (dimensionId != null && modifiedDefinition) {
    const projections = LibMetric.projections(modifiedDefinition);
    if (projections.length === 0) {
      return null;
    }

    const projectionDimension = LibMetric.projectionDimension(
      modifiedDefinition,
      projections[0],
    );
    if (!projectionDimension) {
      return null;
    }

    const dimensionInfo = LibMetric.displayInfo(
      modifiedDefinition,
      projectionDimension,
    );

    return {
      id: slot.slotIndex,
      type: "metric",
      label: dimensionInfo.longDisplayName,
      icon: getDimensionIcon(projectionDimension),
      colors: entryColors,
      availableOptions: computeAvailableOptions(
        effectiveEntry,
        modifiedDefinition,
        dimensionFilter,
      ),
    };
  }

  return {
    id: slot.slotIndex,
    type: "metric",
    label: undefined,
    icon: undefined,
    colors: entryColors,
    availableOptions: computeAvailableOptions(
      effectiveEntry,
      undefined,
      dimensionFilter,
    ),
  };
}

function buildExpressionMetricSources(
  entitySlots: MetricSlot[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  dimensionMapping: Record<number, DimensionId | null>,
  sourceColors: SourceColorMap,
  projectionConfig: { temporalUnit?: TemporalUnit; binningStrategy?: string },
  entity: ExpressionDefinitionEntry,
  dimensionFilter?: (dimension: LibMetric.DimensionMetadata) => boolean,
): ExpressionMetricSource[] {
  return entitySlots.flatMap((slot): ExpressionMetricSource[] => {
    const defEntry = definitions[slot.sourceId];
    if (!defEntry?.definition) {
      return [];
    }

    const effectiveEntry: MetricsViewerDefinitionEntry = {
      id: slot.sourceId,
      definition: defEntry.definition,
    };

    const dimensionId = dimensionMapping[slot.slotIndex];
    const entryColors = sourceColors[slot.entityIndex];
    const metricName = getDefinitionName(defEntry.definition) ?? slot.sourceId;

    // Compute modified definition on the fly for expression token slots.
    let modifiedDefinition: MetricDefinition | undefined;
    if (dimensionId) {
      modifiedDefinition =
        getModifiedDefinition(
          defEntry.definition,
          dimensionId,
          projectionConfig,
        ) ?? undefined;
    }

    let currentDimensionLabel: string | undefined;
    if (dimensionId != null && modifiedDefinition) {
      const projections = LibMetric.projections(modifiedDefinition);
      if (projections.length > 0) {
        const projDim = LibMetric.projectionDimension(
          modifiedDefinition,
          projections[0],
        );
        if (projDim) {
          currentDimensionLabel = LibMetric.displayInfo(
            modifiedDefinition,
            projDim,
          ).longDisplayName;
        }
      }
    }

    return [
      {
        slotIndex: slot.slotIndex,
        sourceId: slot.sourceId,
        metricName,
        metricCount: (() => {
          if (slot.tokenPosition == null) {
            return undefined;
          }
          const token = entity.tokens[slot.tokenPosition];
          return token?.type === "metric" ? token.count : undefined;
        })(),
        colors: entryColors,
        currentDimensionLabel,
        availableOptions: computeAvailableOptions(
          effectiveEntry,
          modifiedDefinition,
          dimensionFilter,
        ),
      },
    ];
  });
}

export function getSelectedMetricsInfo(
  definitions: MetricsViewerDefinitionEntry[],
  loadingIds: Set<MetricSourceId>,
): SelectedMetric[] {
  return definitions.flatMap((entry): SelectedMetric[] => {
    const { definition } = entry;
    const isLoading = loadingIds.has(entry.id);

    if (!definition) {
      const parsed = parseSourceId(entry.id);
      return [
        {
          id: parsed.id,
          sourceType: parsed.type,
          name: null,
          isLoading,
        },
      ];
    }

    const name = getDefinitionName(definition) ?? entry.id;
    const metricId = LibMetric.sourceMetricId(definition);
    if (metricId != null) {
      return [
        {
          id: metricId,
          sourceType: "metric",
          name,
          isLoading,
        },
      ];
    }

    const measureId = LibMetric.sourceMeasureId(definition);
    if (measureId != null) {
      const tableId = LibMetric.sourceMeasureTableId(definition);
      return [
        {
          id: measureId,
          sourceType: "measure",
          name,
          isLoading,
          tableId: tableId ?? undefined,
        },
      ];
    }

    return [];
  });
}
