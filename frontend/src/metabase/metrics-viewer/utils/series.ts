import type { DimensionOption } from "metabase/common/components/DimensionPill";
import type { DimensionItem } from "metabase/metrics-viewer/components/DimensionPillBar";
import { getColorsForValues } from "metabase/ui/colors/charts";
import { getColorplethColorScale } from "metabase/visualizations/components/ChoroplethMap";
import {
  formatBreakoutValue,
  getBreakoutSeriesName,
} from "metabase/visualizations/echarts/cartesian/model/series";
import { MAX_SERIES } from "metabase/visualizations/lib/utils";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
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

interface SourceColorEntry {
  sourceId: MetricSourceId;
  keys: string[];
  keyToBreakoutValue: Record<string, string>;
}

export function computeSourceBreakoutColors(
  definitions: MetricsViewerDefinitionEntry[],
  breakoutValuesBySourceId?: Map<MetricSourceId, MetricBreakoutValuesResponse>,
): SourceBreakoutColorMap {
  const entries: SourceColorEntry[] = [];

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
      const keys: string[] = [];
      const keyToBreakoutValue: Record<string, string> = {};
      response.values.forEach((val) => {
        const breakoutValue = formatBreakoutValue(val, response.col);
        const key = getBreakoutSeriesName(
          val,
          response.col,
          definitions.length > 1,
          displayName,
        );
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
          activeBreakoutColorMap: getSingleColor(breakoutColorMap),
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

export function buildRawSeriesFromDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
  dimensionMapping: Record<MetricSourceId, DimensionId | null>,
  display: MetricsViewerDisplayType,
  resultsByDefinitionId: Map<MetricSourceId, Dataset>,
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>,
  sourceBreakoutColors: SourceBreakoutColorMap,
  extraVizSettings?: Partial<VisualizationSettings>,
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

    const colors = sourceBreakoutColors[entry.id];
    const color = getSingleColor(colors);
    const hasBreakout = entryHasBreakout(entry) && result.data.rows.length > 0;
    const breakoutIsSameAsDimension =
      hasBreakout && result.data.cols.length === 2;
    const nativeBreakout =
      hasBreakout &&
      !breakoutIsSameAsDimension &&
      displayType.supportsMultipleSeries;
    const needsManualBreakoutSplit = hasBreakout && !nativeBreakout;

    let vizSettings: VisualizationSettings;
    if (nativeBreakout) {
      vizSettings = buildCartesianVizSettings(
        result.data,
        true,
        definitions.length > 1,
        name,
        colors instanceof Map ? colors : undefined,
      );
    } else {
      const seriesKey = isFirstSeries ? result.data.cols[1].name : name;
      vizSettings = {
        ...baseSettings,
        ...computeColorVizSettings({
          displayType: display,
          seriesKey,
          color,
        }),
      };
    }

    if (extraVizSettings) {
      vizSettings = { ...vizSettings, ...extraVizSettings };
    }

    const singleSeries: SingleSeries = {
      card: createSeriesCard(cardId, name, display, vizSettings),
      data: result.data,
    };

    let entrySeries: SingleSeries[];
    if (needsManualBreakoutSplit && colors instanceof Map) {
      const { series, activeBreakoutColorMap } = splitByBreakout(
        singleSeries,
        definitions.length,
        isFirstSeries,
        colors,
      );
      entrySeries = series;
      activeBreakoutColors[entry.id] = activeBreakoutColorMap;
    } else {
      entrySeries = [singleSeries];
      if (hasBreakout && !needsManualBreakoutSplit && colors instanceof Map) {
        activeBreakoutColors[entry.id] = filterBreakoutColorsByData(
          colors,
          result.data,
        );
      } else {
        activeBreakoutColors[entry.id] = color;
      }
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
