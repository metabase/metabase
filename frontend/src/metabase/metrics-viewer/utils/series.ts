import type { DimensionOption } from "metabase/common/components/DimensionPill";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";
import type { DimensionItem } from "metabase/metrics-viewer/components/DimensionPillBar";
import { getColorsForValues } from "metabase/ui/colors/charts";
import { getColorplethColorScale } from "metabase/visualizations/components/ChoroplethMap";
import { MAX_SERIES } from "metabase/visualizations/lib/utils";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
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
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

import type {
  BreakoutColorMap,
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDisplayType,
  SelectedMetric,
  SourceBreakoutColorMap,
  SourceColorMap,
} from "../types/viewer-state";

import { getDefinitionName } from "./definition-builder";
import { entryHasBreakout, getEntryBreakout } from "./definition-entries";
import { findDimensionById } from "./dimension-lookup";
import { nextSyntheticCardId, parseSourceId } from "./source-ids";
import { DISPLAY_TYPE_REGISTRY } from "./tab-config";
import { getDimensionIcon } from "./tabs";

function getDefinitionCardId(def: MetricDefinition): number | null {
  const metricId = LibMetric.sourceMetricId(def);
  if (metricId != null) {
    return metricId;
  }
  const measureId = LibMetric.sourceMeasureId(def);
  if (measureId != null) {
    return nextSyntheticCardId();
  }
  return null;
}

function formatBreakoutValue(value: RowValue, column: DatasetColumn): string {
  return String(
    formatValue(isEmpty(value) ? NULL_DISPLAY_VALUE : value, {
      column,
    }),
  );
}

export function computeSourceBreakoutColors(
  definitions: MetricsViewerDefinitionEntry[],
  breakoutValuesBySourceId?: Map<MetricSourceId, MetricBreakoutValuesResponse>,
): SourceBreakoutColorMap {
  const entries: {
    sourceId: MetricSourceId;
    keys: string[];
    keyToBreakoutValue: Record<string, string>;
  }[] = [];

  for (const entry of definitions) {
    if (!entry.definition) {
      continue;
    }
    const displayName = getDefinitionName(entry.definition);
    if (!displayName) {
      continue;
    }

    const response = breakoutValuesBySourceId?.get(entry.id);
    if (entryHasBreakout(entry) && response && response.values.length > 0) {
      // getColorsForValues needs unique keys
      const keys: string[] = [];
      // but we want to return the (possibly non-unique) breakout values to be displayed in the legend
      const keyToBreakoutValue: Record<string, string> = {};
      response.values.forEach((val) => {
        const breakoutValue = formatBreakoutValue(val, response.col);
        const key = `${displayName}: ${breakoutValue}`;
        keys.push(key);
        keyToBreakoutValue[key] = breakoutValue;
      });
      entries.push({ sourceId: entry.id, keys, keyToBreakoutValue });
    } else {
      entries.push({
        sourceId: entry.id,
        keys: [displayName],
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
      result[entry.sourceId] = colorMapping[entry.keys[0]];
    } else {
      result[entry.sourceId] = new Map(
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

// Column layout with breakout:
// - 3 cols when dimension != breakout: [dimension, breakout, metric] → output: [dimension, metric]
// - 2 cols when dimension == breakout: [breakout, metric] → output: [breakout, metric]
export function splitByBreakout(
  series: SingleSeries,
  seriesCount: number,
  isFirstSeries: boolean,
  breakoutColorMap: BreakoutColorMap,
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
          activeBreakoutColorMap: getSingleColor(breakoutColorMap),
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

export function buildRawSeriesFromDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
  dimensionMapping: Record<MetricSourceId, DimensionId | null>,
  display: MetricsViewerDisplayType,
  resultsByDefinitionId: Map<MetricSourceId, Dataset>,
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>,
  sourceBreakoutColors: SourceBreakoutColorMap,
): {
  series: SingleSeries[];
  cardIdToDefinitionId: Record<CardId, MetricSourceId>;
  activeBreakoutColors: SourceBreakoutColorMap;
} {
  const firstSettingsEntry = definitions.reduce<{
    def: MetricDefinition;
    dimension: DimensionMetadata;
  } | null>((found, entry) => {
    if (found) {
      return found;
    }
    const dimensionId = dimensionMapping[entry.id];
    if (!dimensionId || !entry.definition) {
      return null;
    }
    const dimension = findDimensionById(entry.definition, dimensionId);
    if (!dimension) {
      return null;
    }
    const def = modifiedDefinitions.get(entry.id);
    if (!def) {
      return null;
    }
    return { def, dimension };
  }, null);

  if (!firstSettingsEntry) {
    return { series: [], cardIdToDefinitionId: {}, activeBreakoutColors: {} };
  }

  const displayType = DISPLAY_TYPE_REGISTRY[display];
  const baseSettings = displayType.getSettings(
    firstSettingsEntry.def,
    firstSettingsEntry.dimension,
  );

  let isFirstSeries = true;
  const cardIdToDefinitionId: Record<CardId, MetricSourceId> = {};
  const activeBreakoutColors: SourceBreakoutColorMap = {};

  const series = definitions.flatMap((entry) => {
    const dimensionId = dimensionMapping[entry.id];
    if (!dimensionId || !entry.definition) {
      return [];
    }

    const modDef = modifiedDefinitions.get(entry.id);
    const result = resultsByDefinitionId.get(entry.id);
    if (!modDef || !result?.data?.cols?.length) {
      return [];
    }

    if (LibMetric.projections(modDef).length === 0) {
      return [];
    }

    const cardId = getDefinitionCardId(entry.definition);
    if (cardId == null) {
      return [];
    }

    const name = getDefinitionName(entry.definition);
    if (!name) {
      return [];
    }

    const seriesKey = isFirstSeries ? result.data.cols[1]?.name : name;

    const colors = sourceBreakoutColors[entry.id];
    const color = getSingleColor(colors);

    const singleSeries: SingleSeries = {
      card: createSeriesCard(cardId, name, display, {
        ...baseSettings,
        ...computeColorVizSettings({
          displayType: display,
          seriesKey,
          color,
        }),
      }),
      data: result.data,
    };

    let entrySeries: SingleSeries[];
    if (
      !entryHasBreakout(entry) ||
      singleSeries.data.rows.length === 0 ||
      !(colors instanceof Map)
    ) {
      entrySeries = [singleSeries];
      activeBreakoutColors[entry.id] = color;
    } else {
      const { series, activeBreakoutColorMap } = splitByBreakout(
        singleSeries,
        definitions.length,
        isFirstSeries,
        colors,
      );
      entrySeries = series;
      activeBreakoutColors[entry.id] = activeBreakoutColorMap;
    }
    isFirstSeries = false;

    for (const s of entrySeries) {
      cardIdToDefinitionId[s.card.id] = entry.id;
    }

    return entrySeries;
  });

  if (series.length > 1 && displayType.combineSettings) {
    series[0].card.visualization_settings = displayType.combineSettings(
      series.map((s) => s.card.visualization_settings),
    );
  }

  return { series, cardIdToDefinitionId, activeBreakoutColors };
}

function computeColorVizSettings({
  displayType,
  seriesKey,
  color,
}: {
  displayType: VisualizationDisplay;
  seriesKey: string;
  color: string | undefined;
}): Partial<Pick<VisualizationSettings, "series_settings" | "map.colors">> {
  if (color == null) {
    return {};
  }
  if (displayType === "map") {
    return {
      "map.colors": getColorplethColorScale(color),
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
  definitions: MetricsViewerDefinitionEntry[],
  dimensionMapping: Record<MetricSourceId, DimensionId | null>,
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>,
  sourceColors: SourceColorMap,
  dimensionFilter?: (dimension: LibMetric.DimensionMetadata) => boolean,
): DimensionItem[] {
  return definitions.flatMap((entry): DimensionItem[] => {
    if (!entry.definition) {
      return [];
    }

    const dimensionId = dimensionMapping[entry.id];
    const entryColors = sourceColors[entry.id];
    const modifiedDefinition = modifiedDefinitions.get(entry.id);

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
