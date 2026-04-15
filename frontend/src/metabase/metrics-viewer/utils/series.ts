import { t } from "ttag";

import type { DimensionOption } from "metabase/common/components/DimensionPill";
import type {
  DimensionPillBarItem,
  ExpressionDimensionItem,
  ExpressionMetricSource,
  MetricDimensionItem,
} from "metabase/metrics-viewer/components/DimensionPillBar";
import type { IconName } from "metabase/ui";
import { getColorsForValues } from "metabase/ui/colors/charts";
import { getColorplethColorScale } from "metabase/visualizations/components/ChoroplethMap";
import {
  formatBreakoutValue,
  getBreakoutSeriesName,
} from "metabase/visualizations/echarts/cartesian/model/series";
import { MAX_SERIES } from "metabase/visualizations/lib/utils";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  Card,
  CardId,
  Dataset,
  DatasetColumn,
  DatasetData,
  DimensionId,
  MetricBreakoutValuesResponse,
  RowValue,
  RowValues,
  SeriesSettings,
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
  extraVizSettings?: Partial<VisualizationSettings>;
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
  extraVizSettings,
}: BuildSeriesParams): {
  series: SingleSeries[];
  cardIdToEntityIndex: Record<CardId, number>;
  activeBreakoutColors: SourceBreakoutColorMap;
} {
  const uniqueNamesByEntityIndex = computeUniqueEntityNames(
    formulaEntities,
    definitions,
  );
  const displayType = DISPLAY_TYPE_REGISTRY[display];

  let isFirstSeries = true;
  const cardIdToEntityIndex: Record<CardId, number> = {};
  const activeBreakoutColors: SourceBreakoutColorMap = {};

  const series = Array.from(resultsByEntityIndex.entries()).flatMap(
    ([entityIndex, result]) => {
      let vizSettings: VisualizationSettings | null = null;
      const entity = formulaEntities[entityIndex];

      const name = uniqueNamesByEntityIndex.get(entityIndex);
      if (!name) {
        return [];
      }

      const colors = sourceBreakoutColors[entityIndex];
      const color = getSingleColor(colors);
      const hasBreakout =
        isMetricEntry(entity) &&
        entryHasBreakout(getEffectiveDefinitionEntry(entity, definitions)) &&
        result.data.rows.length > 0;
      const breakoutIsSameAsDimension =
        hasBreakout && result.data.cols.length === 2;
      const nativeBreakout =
        hasBreakout &&
        !breakoutIsSameAsDimension &&
        displayType.supportsMultipleSeries;
      const needsManualBreakoutSplit = hasBreakout && !nativeBreakout;

      if (nativeBreakout) {
        vizSettings = buildCartesianVizSettings(
          result.data,
          true,
          formulaEntities.length > 1,
          name,
          colors instanceof Map ? colors : undefined,
        );
      } else {
        vizSettings = getVizSettings(
          dimensionMapping,
          display,
          modifiedDefinitionsBySlotIndex,
          metricSlots
            .filter((slot) => slot.entityIndex === entityIndex)
            .map((slot) => slot.slotIndex),
        );
      }
      if (!vizSettings) {
        return [];
      }
      const cardId = nextSyntheticCardId();

      const seriesKey = isFirstSeries ? result.data.cols[1]?.name : name;

      const vizSettingsOverride: Partial<VisualizationSettings> = nativeBreakout
        ? {}
        : computeColorVizSettings({
            displayType: display,
            seriesKey,
            color,
          });

      // When an expression is the first (or only) series the vizSettingsKey
      // equals the raw column name ("Expression").  Override the series title
      // so the tooltip / legend display the user-provided name instead.
      if (isFirstSeries && isExpressionEntry(entity) && seriesKey && name) {
        vizSettingsOverride.series_settings = {
          ...vizSettingsOverride.series_settings,
          [seriesKey]: {
            ...vizSettingsOverride.series_settings?.[seriesKey],
            title: name,
          },
        };
      }

      const singleSeries: SingleSeries = {
        card: createSeriesCard(cardId, name, display, {
          ...vizSettings,
          ...vizSettingsOverride,
          ...extraVizSettings,
        }),
        data: result.data,
      };

      let entrySeries: SingleSeries[];
      if (needsManualBreakoutSplit && colors instanceof Map) {
        const { series, activeBreakoutColorMap } = splitByBreakout(
          singleSeries,
          formulaEntities.length,
          isFirstSeries,
          colors,
          vizSettings,
        );
        entrySeries = series;
        activeBreakoutColors[entityIndex] = activeBreakoutColorMap;
      } else {
        entrySeries = [singleSeries];
        if (hasBreakout && !needsManualBreakoutSplit && colors instanceof Map) {
          activeBreakoutColors[entityIndex] = filterBreakoutColorsByData(
            colors,
            result.data,
          );
        } else {
          activeBreakoutColors[entityIndex] = color;
        }
      }

      isFirstSeries = false;

      for (const series of entrySeries) {
        cardIdToEntityIndex[series.card.id] = entityIndex;
      }
      return entrySeries;
    },
  );

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

interface SourceColorEntry {
  entityIndex: number;
  keys: string[];
  keyToBreakoutValue: Record<string, string>;
}

export function computeSourceBreakoutColors(
  formulaEntities: MetricsViewerFormulaEntity[],
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>,
  breakoutValuesByEntityIndex?: Map<number, MetricBreakoutValuesResponse>,
): SourceBreakoutColorMap {
  const uniqueNames = computeUniqueEntityNames(formulaEntities, definitions);

  const entries: SourceColorEntry[] = [];

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
        const keys: string[] = [];
        const keyToBreakoutValue: Record<string, string> = {};
        response.values.forEach((val) => {
          const breakoutValue = formatBreakoutValue(val, response.col);
          const key = getBreakoutSeriesName(
            val,
            response.col,
            uniqueNames.size > 1,
            uniqueName,
          );
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
      // Use entity.id (which encodes the formula text) as the color key so
      // that renaming the expression doesn't change its assigned color.
      entries.push({
        entityIndex,
        keys: [entity.id],
        keyToBreakoutValue: {},
      });
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

export function getSingleColor(
  colors: BreakoutColorMap | string | undefined,
): string | undefined {
  return typeof colors === "string"
    ? colors
    : colors instanceof Map
      ? colors.values().next().value
      : undefined;
}

// Result data columns layout: [dimension, breakout, metric].
const DIMENSION_COLUMN_INDEX = 0;
const BREAKOUT_COLUMN_INDEX = 1;
const METRIC_COLUMN_INDEX = 2;

// When the breakout dimension is the same as the tab's dimension,
// the query avoids adding it twice, so we get [breakout, metric] instead of [dimension, breakout, metric].
function getBreakoutColumnDescriptor(cols: DatasetColumn[]): {
  index: number;
  column: DatasetColumn;
} {
  const breakoutIsSameAsDimension = cols.length === 2;
  const index = breakoutIsSameAsDimension
    ? DIMENSION_COLUMN_INDEX
    : BREAKOUT_COLUMN_INDEX;
  return { index, column: cols[index] };
}

function getMetricColumnIndex(cols: DatasetColumn[]): number {
  const breakoutIsSameAsDimension = cols.length === 2;
  return breakoutIsSameAsDimension
    ? BREAKOUT_COLUMN_INDEX
    : METRIC_COLUMN_INDEX;
}

function filterBreakoutColorsByData(
  breakoutColors: BreakoutColorMap,
  data: DatasetData,
): BreakoutColorMap {
  const breakoutCol = data.cols[BREAKOUT_COLUMN_INDEX];
  const presentValues = new Set(
    data.rows.map((row) =>
      formatBreakoutValue(row[BREAKOUT_COLUMN_INDEX], breakoutCol),
    ),
  );
  const filtered: BreakoutColorMap = new Map();
  for (const [value, color] of breakoutColors) {
    if (presentValues.has(value)) {
      filtered.set(value, color);
    }
  }
  return filtered;
}

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

  const breakout = getBreakoutColumnDescriptor(cols);
  const metricColumnIndex = getMetricColumnIndex(cols);
  const metricCol = cols[metricColumnIndex];
  const outputCols = [cols[DIMENSION_COLUMN_INDEX], metricCol];

  const rowsByBreakoutValue = new Map<RowValue, RowValues[]>();

  for (const row of data.rows) {
    const breakoutValue = formatBreakoutValue(
      row[breakout.index],
      breakout.column,
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
    groupedRows.push([
      row[DIMENSION_COLUMN_INDEX],
      row[metricColumnIndex],
    ] as RowValues);
  }

  const activeBreakoutColorMap: BreakoutColorMap = new Map();

  const breakoutSeries = Array.from(breakoutColorMap)
    .map(([breakoutValue, color]) => {
      const rows = rowsByBreakoutValue.get(breakoutValue);
      if (!rows) {
        return null;
      }

      activeBreakoutColorMap.set(breakoutValue, color);

      const name = getBreakoutSeriesName(
        breakoutValue,
        breakout.column,
        seriesCount > 1,
        card.name,
      );

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

export function buildCartesianVizSettings(
  data: DatasetData,
  hasBreakout: boolean,
  hasMultipleCards: boolean,
  cardName: string | null,
  breakoutColors?: BreakoutColorMap,
): VisualizationSettings {
  const { cols } = data;
  const dimensions = [cols[DIMENSION_COLUMN_INDEX].name];
  if (hasBreakout) {
    dimensions.push(cols[BREAKOUT_COLUMN_INDEX].name);
  }

  return {
    "graph.x_axis.labels_enabled": false,
    "graph.y_axis.labels_enabled": false,
    "graph.dimensions": dimensions,
    "graph.metrics": [cols[cols.length - 1].name],
    ...(hasBreakout && breakoutColors
      ? computeBreakoutColorSettings(
          breakoutColors,
          cols[BREAKOUT_COLUMN_INDEX],
          hasMultipleCards,
          cardName,
        )
      : {}),
  };
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

export function computeBreakoutColorSettings(
  breakoutColors: BreakoutColorMap,
  breakoutCol: DatasetColumn,
  hasMultipleCards: boolean,
  cardName: string | null,
): Pick<VisualizationSettings, "series_settings"> {
  const seriesSettings: Record<string, SeriesSettings> = {};
  for (const [formattedValue, color] of breakoutColors) {
    const seriesName = getBreakoutSeriesName(
      formattedValue,
      breakoutCol,
      hasMultipleCards,
      cardName,
    );
    seriesSettings[seriesName] = { color };
  }
  return { series_settings: seriesSettings };
}

interface ColorVizSettingsParams {
  displayType: VisualizationDisplay;
  seriesKey: string;
  color: string | undefined;
}

export function computeColorVizSettings({
  displayType,
  seriesKey,
  color,
}: ColorVizSettingsParams): Partial<
  Pick<VisualizationSettings, "series_settings" | "map.colors">
> {
  if (color == null) {
    return {};
  }
  if (displayType === "map") {
    return {
      "map.colors": getColorplethColorScale(color),
    };
  }
  return {
    series_settings: {
      [seriesKey]: {
        color,
      },
    },
  };
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

      // Derive aggregate label and icon from selected dimensions.
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
      const selectedIcons = metricSources
        .map((s) => s.currentDimensionIcon)
        .filter(Boolean);
      const uniqueIcons = [...new Set(selectedIcons)];
      const icon = uniqueIcons.length === 1 ? uniqueIcons[0] : undefined;

      const expressionColors = sourceColors[slot.entityIndex];

      items.push({
        type: "expression",
        id: slot.entityIndex,
        colors: expressionColors,
        label,
        icon,
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
    let currentDimensionIcon: IconName | undefined;
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
          currentDimensionIcon = getDimensionIcon(projDim);
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
        currentDimensionIcon,
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
