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

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerDisplayType,
  SelectedMetric,
  SourceColorMap,
} from "../types/viewer-state";

import {
  getDefinitionColumnName,
  getDefinitionName,
} from "./definition-builder";
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

/**
 * Computes colors for each definition by building the same series key array
 * that the chart pipeline would produce, then passing it to getColorsForValues.
 *
 * Chart key rules (from transformSeries → keyForSingleSeries):
 *   - First series key = col.name (slugified metric/measure card name)
 *   - Subsequent series keys = card.name (displayName or "displayName: breakoutValue")
 */
export function computeSourceColors(
  definitions: MetricsViewerDefinitionEntry[],
  breakoutValuesBySourceId?: Map<MetricSourceId, MetricBreakoutValuesResponse>,
): SourceColorMap {
  const entries: { sourceId: MetricSourceId; keys: string[] }[] = [];

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
      const keys = response.values.map((val) => {
        const formatted = String(
          formatValue(isEmpty(val) ? NULL_DISPLAY_VALUE : val, {
            column: response.col,
          }),
        );
        return definitions.length > 1
          ? `${displayName}: ${formatted}`
          : formatted;
      });
      entries.push({ sourceId: entry.id, keys });
    } else {
      entries.push({ sourceId: entry.id, keys: [displayName] });
    }
  }

  if (entries.length === 0) {
    return {};
  }

  const allKeys = entries.flatMap((entry) => entry.keys);

  const firstDefinition = definitions.find(
    (definition) => definition.id === entries[0].sourceId,
  )?.definition;
  if (firstDefinition) {
    const columnName = getDefinitionColumnName(firstDefinition);
    if (columnName) {
      allKeys[0] = columnName;
    }
  }

  const colorMapping = getColorsForValues(allKeys);

  const result: SourceColorMap = {};
  let idx = 0;
  for (const entry of entries) {
    result[entry.sourceId] = entry.keys.map(
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

    const seriesKey = getSeriesVizSettingsKey(
      metricCol,
      false,
      true,
      1,
      null,
      name,
    );

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
  definitions: MetricsViewerDefinitionEntry[],
  dimensionMapping: Record<MetricSourceId, DimensionId | null>,
  display: MetricsViewerDisplayType,
  resultsByDefinitionId: Map<MetricSourceId, Dataset>,
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>,
  sourceColors: SourceColorMap,
): {
  series: SingleSeries[];
  cardIdToDimensionId: Record<CardId, MetricSourceId>;
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
    return { series: [], cardIdToDimensionId: {} };
  }

  const baseSettings = DISPLAY_TYPE_REGISTRY[display].getSettings(
    firstSettingsEntry.def,
    firstSettingsEntry.dimension,
  );

  const cardIdToDimensionId: Record<CardId, MetricSourceId> = {};

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

    const seriesKey = getSeriesVizSettingsKey(
      result.data.cols[1], // metric API returns [projection_cols..., aggregation_col]
      false,
      true,
      1,
      null,
      name ?? undefined,
    );

    const singleSeries: SingleSeries = {
      card: createSeriesCard(cardId, name, display, {
        ...baseSettings,
        ...computeColorVizSettings({
          displayType: display,
          seriesKey,
          color: sourceColors[entry.id]?.[0],
        }),
      }),
      data: result.data,
    };

    let entrySeries: SingleSeries[];
    if (!entryHasBreakout(entry) || singleSeries.data.rows.length === 0) {
      entrySeries = [singleSeries];
    } else {
      entrySeries = splitByBreakout(
        singleSeries,
        definitions.length,
        sourceColors[entry.id],
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
