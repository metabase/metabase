import type { DimensionOption } from "metabase/common/components/DimensionPill";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";
import type { DimensionItem } from "metabase/metrics-viewer/components/DimensionPillBar";
import { getColorsForValues } from "metabase/ui/colors/charts";
import { getColorplethColorScale } from "metabase/visualizations/components/ChoroplethMap";
import { getSeriesVizSettingsKey } from "metabase/visualizations/echarts/cartesian/model/series";
import { MAX_SERIES } from "metabase/visualizations/lib/utils";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  Card,
  CardId,
  Dataset,
  DimensionId,
  MetricBreakoutValuesResponse,
  RowValue,
  RowValues,
  SingleSeries,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

import {
  type MetricDefinitionEntry,
  type MetricSourceId,
  type MetricsViewerDefinitionEntry,
  type MetricsViewerDisplayType,
  type MetricsViewerFormulaEntity,
  type SelectedMetric,
  type SourceColorMap,
  isExpressionEntry,
  isMetricEntry,
} from "../types/viewer-state";

import { getDefinitionName } from "./definition-builder";
import {
  entryHasBreakout,
  getEffectiveDefinitionEntry,
  getEntryBreakout,
} from "./definition-entries";
import { findDimensionById } from "./dimension-lookup";
import { nextSyntheticCardId, parseSourceId } from "./source-ids";
import { DISPLAY_TYPE_REGISTRY } from "./tab-config";
import { getDimensionIcon } from "./tabs";

export function buildArithmeticSeriesFromResult(
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  dimensionMapping: Record<MetricSourceId, DimensionId | null>,
  display: MetricsViewerDisplayType,
  arithmeticResult: Dataset,
  modifiedDefinitions: Record<MetricSourceId, MetricDefinition>,
  expressionName: string,
  sourceColors: string[] | undefined,
): SingleSeries[] {
  if (!arithmeticResult.data?.cols?.length) {
    return [];
  }

  const modDefMap = new Map(Object.entries(modifiedDefinitions)) as Map<
    MetricSourceId,
    MetricDefinition
  >;
  const vizSettings = getVizSettingsBySourceId(
    display,
    Object.values(definitions),
    definitions,
    modDefMap,
    dimensionMapping,
  );
  if (!vizSettings) {
    return [];
  }

  const cardId = nextSyntheticCardId();
  const cols = arithmeticResult.data.cols;
  const metricCol = cols[cols.length - 1];
  const seriesKey = getSeriesVizSettingsKey(
    metricCol,
    false,
    true,
    1,
    null,
    expressionName,
  );

  return [
    {
      card: createSeriesCard(cardId, expressionName, display, {
        ...vizSettings,
        ...computeColorVizSettings({
          displayType: display,
          seriesKey,
          color: sourceColors?.[0],
        }),
      }),
      data: arithmeticResult.data,
    },
  ];
}

/**
 * Resolve viz settings from source-ID-keyed modified definitions.
 * Used by the expression/arithmetic series path.
 */
function getVizSettingsBySourceId(
  display: MetricsViewerDisplayType,
  entries: MetricsViewerDefinitionEntry[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>,
  dimensionMapping: Record<MetricSourceId, DimensionId | null>,
): VisualizationSettings | null {
  const displayConfig = DISPLAY_TYPE_REGISTRY[display];

  return entries.reduce<VisualizationSettings | null>((found, entry) => {
    if (found) {
      return found;
    }
    const definition = definitions[entry.id]?.definition;
    const modifiedDefinition = modifiedDefinitions.get(entry.id);
    if (!definition || !modifiedDefinition) {
      return null;
    }

    const dimensionId = dimensionMapping[entry.id];

    if (displayConfig.dimensionRequired) {
      if (!dimensionId) {
        return null;
      }
      const dimension = findDimensionById(definition, dimensionId);
      if (!dimension) {
        return null;
      }
      return displayConfig.getSettings(modifiedDefinition, dimension);
    }

    return displayConfig.getSettings(modifiedDefinition);
  }, null);
}

/**
 * Resolve viz settings from entity-index-keyed modified definitions.
 * Used by the individual metric series path.
 */
function getVizSettingsByEntityIndex(
  display: MetricsViewerDisplayType,
  indexedEntries: {
    entry: MetricsViewerDefinitionEntry;
    entityIndex: number;
  }[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  modifiedDefinitions: Map<number, MetricDefinition>,
  dimensionMapping: Record<MetricSourceId, DimensionId | null>,
): VisualizationSettings | null {
  const displayConfig = DISPLAY_TYPE_REGISTRY[display];

  return indexedEntries.reduce<VisualizationSettings | null>(
    (found, { entry, entityIndex }) => {
      if (found) {
        return found;
      }
      const definition = definitions[entry.id]?.definition;
      const modifiedDefinition = modifiedDefinitions.get(entityIndex);
      if (!definition || !modifiedDefinition) {
        return null;
      }

      const dimensionId = dimensionMapping[entry.id];

      if (displayConfig.dimensionRequired) {
        if (!dimensionId) {
          return null;
        }
        const dimension = findDimensionById(definition, dimensionId);
        if (!dimension) {
          return null;
        }
        return displayConfig.getSettings(modifiedDefinition, dimension);
      }

      return displayConfig.getSettings(modifiedDefinition);
    },
    null,
  );
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

/**
 * Computes colors for each formula entity by building the same series key array
 * that the chart pipeline would produce, then passing it to getColorsForValues.
 *
 * Chart key rules (from transformSeries → keyForSingleSeries):
 *   - Series key = card.name (unique per entity via computeUniqueEntityNames)
 *   - Breakout series key = "displayName: breakoutValue"
 */
export function computeSourceColors(
  formulaEntities: MetricsViewerFormulaEntity[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  breakoutValuesByEntityIndex?: Map<number, MetricBreakoutValuesResponse>,
): SourceColorMap {
  const uniqueNames = computeUniqueEntityNames(formulaEntities, definitions);

  const entries: {
    entityIndex: number;
    keys: string[];
  }[] = [];

  // Count visible formula entities (metrics + expressions), matching the
  // `defCount` / `seriesCount` used by `buildRawSeriesFromDefinitions` and
  // `splitByBreakout` to decide whether to prefix breakout labels with the
  // metric name.  Using `Object.keys(definitions).length` would undercount
  // when the same metric appears multiple times.
  const defCount = formulaEntities.filter(
    (e) => isMetricEntry(e) || isExpressionEntry(e),
  ).length;

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
        const keys = response.values.map((val) => {
          const formatted = String(
            formatValue(isEmpty(val) ? NULL_DISPLAY_VALUE : val, {
              column: response.col,
            }),
          );
          return defCount > 1 ? `${uniqueName}: ${formatted}` : formatted;
        });
        entries.push({ entityIndex, keys });
      } else {
        entries.push({ entityIndex, keys: [uniqueName] });
      }
    }

    if (isExpressionEntry(entity)) {
      entries.push({ entityIndex, keys: [uniqueName] });
    }
  }

  if (entries.length === 0) {
    return {};
  }

  const allKeys = entries.flatMap((entry) => entry.keys);
  const colorMapping = getColorsForValues(allKeys);

  const result: SourceColorMap = {};
  let idx = 0;
  for (const entry of entries) {
    result[entry.entityIndex] = entry.keys.map(
      (_, i) => colorMapping[allKeys[idx + i]],
    );
    idx += entry.keys.length;
  }
  return result;
}

// Column layout with breakout:
// - 3 cols when dimension != breakout: [dimension, breakout, metric] → output: [dimension, metric]
// - 2 cols when dimension == breakout: [breakout, metric] → output: [breakout, metric]
export function splitByBreakout(
  series: SingleSeries,
  seriesCount: number,
  sourceColors?: string[],
  vizSettings?: VisualizationSettings,
): SingleSeries[] {
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
    const breakoutValue = row[breakoutColumnIndex];
    let groupedRows = rowsByBreakoutValue.get(breakoutValue);
    if (!groupedRows) {
      groupedRows = [];
      rowsByBreakoutValue.set(breakoutValue, groupedRows);
      if (rowsByBreakoutValue.size > MAX_SERIES) {
        return [series];
      }
    }
    groupedRows.push([row[0], row[metricColumnIndex]] as RowValues);
  }

  return Array.from(rowsByBreakoutValue.keys()).map((breakoutValue, i) => {
    const name = [
      seriesCount > 1 && card.name,
      formatValue(isEmpty(breakoutValue) ? NULL_DISPLAY_VALUE : breakoutValue, {
        column: breakoutCol,
      }),
    ]
      .filter(Boolean)
      .join(": ");

    // Use card.name as the series_settings key so it matches keyForSingleSeries.
    // For breakout series, the name includes the breakout value and is already
    // unique, so we use it directly as the key.
    const seriesKey = name;

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
            color: sourceColors?.[i],
          }),
        },
      },
      data: {
        ...data,
        rows: rowsByBreakoutValue.get(breakoutValue)!,
        cols: outputCols,
      },
    };
  });
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

export function buildRawSeriesFromDefinitions(
  indexedMetrics: { entry: MetricDefinitionEntry; entityIndex: number }[],
  dimensionMapping: Record<MetricSourceId, DimensionId | null>,
  display: MetricsViewerDisplayType,
  resultsByEntityIndex: Map<number, Dataset>,
  modifiedDefinitions: Map<number, MetricDefinition>,
  sourceColors: SourceColorMap,
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  uniqueNames: Map<number, string>,
  totalEntityCount: number,
): {
  series: SingleSeries[];
  cardIdToDimensionId: Record<CardId, MetricSourceId>;
} {
  const vizSettings = getVizSettingsByEntityIndex(
    display,
    indexedMetrics,
    definitions,
    modifiedDefinitions,
    dimensionMapping,
  );

  if (!vizSettings) {
    return { series: [], cardIdToDimensionId: {} };
  }

  const cardIdToDimensionId: Record<CardId, MetricSourceId> = {};

  const series = indexedMetrics.flatMap(({ entry, entityIndex }) => {
    const definition = definitions[entry.id]?.definition;
    if (!definition) {
      return [];
    }

    const modDef = modifiedDefinitions.get(entityIndex);
    const result = resultsByEntityIndex.get(entityIndex);
    if (!modDef || !result?.data?.cols?.length) {
      return [];
    }

    const cardId = nextSyntheticCardId();
    if (cardId == null) {
      return [];
    }

    const uniqueName = uniqueNames.get(entityIndex);
    const name = uniqueName ?? getDefinitionName(definition);

    // Use card.name as the series_settings key so it matches what
    // keyForSingleSeries returns in the chart pipeline.
    const seriesKey = getSeriesVizSettingsKey(
      result.data.cols[Math.min(1, result.data.cols.length - 1)], // metric API returns [projection_cols..., aggregation_col]
      false,
      true,
      1,
      null,
      name ?? undefined,
    );

    const singleSeries: SingleSeries = {
      card: createSeriesCard(cardId, name, display, {
        ...vizSettings,
        ...computeColorVizSettings({
          displayType: display,
          seriesKey,
          color: sourceColors[entityIndex]?.[0],
        }),
      }),
      data: result.data,
    };

    let entrySeries: SingleSeries[];
    if (
      !entryHasBreakout(getEffectiveDefinitionEntry(entry, definitions)) ||
      singleSeries.data.rows.length === 0
    ) {
      entrySeries = [singleSeries];
    } else {
      entrySeries = splitByBreakout(
        singleSeries,
        totalEntityCount,
        sourceColors[entityIndex] ?? [],
        vizSettings,
      );
    }

    for (const s of entrySeries) {
      cardIdToDimensionId[s.card.id] = entry.id;
    }

    return entrySeries;
  });

  return { series, cardIdToDimensionId };
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

export function buildDimensionItemsFromDefinitions(
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  dimensionMapping: Record<MetricSourceId, DimensionId | null>,
  modifiedDefinitions: Map<number, MetricDefinition>,
  sourceColors: SourceColorMap,
  formulaEntities: MetricsViewerFormulaEntity[],
  dimensionFilter?: (dimension: LibMetric.DimensionMetadata) => boolean,
): DimensionItem[] {
  // Build quick lookups: sourceId → first entity-index colour set & modified def.
  // Dimension items are per-source, so we just need a representative.
  const colorsBySourceId: Partial<Record<MetricSourceId, string[]>> = {};
  const modDefBySourceId = new Map<MetricSourceId, MetricDefinition>();

  formulaEntities.forEach((entity, index) => {
    if (isMetricEntry(entity)) {
      if (!(entity.id in colorsBySourceId) && sourceColors[index]) {
        colorsBySourceId[entity.id] = sourceColors[index];
      }
      if (!modDefBySourceId.has(entity.id)) {
        const md = modifiedDefinitions.get(index);
        if (md) {
          modDefBySourceId.set(entity.id, md);
        }
      }
    }
  });

  return Object.values(definitions).flatMap((entry): DimensionItem[] => {
    if (!entry.definition) {
      return [];
    }

    const dimensionId = dimensionMapping[entry.id];
    const entryColors = colorsBySourceId[entry.id];
    const modifiedDefinition = modDefBySourceId.get(entry.id);

    if (dimensionId != null && modifiedDefinition) {
      const projections = LibMetric.projections(modifiedDefinition);
      if (projections.length === 0) {
        return [];
      }

      const projectionDimension = LibMetric.projectionDimension(
        modifiedDefinition,
        projections[0],
      );
      if (!projectionDimension) {
        return [];
      }

      const dimensionInfo = LibMetric.displayInfo(
        modifiedDefinition,
        projectionDimension,
      );

      return [
        {
          id: entry.id,
          label: dimensionInfo.longDisplayName,
          icon: getDimensionIcon(projectionDimension),
          colors: entryColors,
          availableOptions: computeAvailableOptions(
            entry,
            modifiedDefinition,
            dimensionFilter,
          ),
        },
      ];
    }

    const availableOptions = computeAvailableOptions(
      entry,
      undefined,
      dimensionFilter,
    );

    return [
      {
        id: entry.id,
        label: undefined,
        icon: undefined,
        colors: entryColors,
        availableOptions,
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
