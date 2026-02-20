import type { DimensionOption } from "metabase/common/components/DimensionPill";
import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";
import { getColorplethColorScale } from "metabase/visualizations/components/ChoroplethMap";
import { getSeriesVizSettingsKey } from "metabase/visualizations/echarts/cartesian/model/series";
import { MAX_SERIES } from "metabase/visualizations/lib/utils";
import type { DimensionMetadata, MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  Card,
  Dataset,
  MetricBreakoutValuesResponse,
  RowValue,
  RowValues,
  SingleSeries,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

import {
  getDefinitionColumnName,
  getDefinitionName,
} from "../adapters/definition-loader";
import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  SelectedMetric,
  SourceColorMap,
} from "../types/viewer-state";

import { findDimensionById } from "./metrics";
import { nextSyntheticCardId, parseSourceId } from "./source-ids";
import { DISPLAY_TYPE_REGISTRY } from "./tab-config";
import { getDimensionIcon } from "./tabs";

export function getEntryBreakout(
  entry: MetricsViewerDefinitionEntry,
): LibMetric.ProjectionClause | undefined {
  if (!entry.definition) {
    return undefined;
  }
  const projections = LibMetric.projections(entry.definition);
  return projections[0];
}

export function entryHasBreakout(entry: MetricsViewerDefinitionEntry): boolean {
  return getEntryBreakout(entry) !== undefined;
}

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

  const allKeys = entries.flatMap((e) => e.keys);

  const firstDef = definitions.find(
    (d) => d.id === entries[0].sourceId,
  )?.definition;
  if (firstDef) {
    const columnName = getDefinitionColumnName(firstDef);
    if (columnName) {
      allKeys[0] = columnName;
    }
  }

  const colorMapping = getColorsForValues(allKeys);

  const result: SourceColorMap = {};
  let idx = 0;
  for (const e of entries) {
    result[e.sourceId] = e.keys.map((_, i) => colorMapping[allKeys[idx + i]]);
    idx += e.keys.length;
  }
  return result;
}

function splitByBreakout(
  series: SingleSeries,
  seriesCount: number,
  projectionCount: number,
  keepSeriesColumn = false,
  sourceColors?: string[],
): SingleSeries[] {
  const { card, data } = series;
  const { cols, rows } = data;

  const seriesColumnIndex = projectionCount - 1;
  const dimensionColumnIndexes = Array.from(
    { length: seriesColumnIndex },
    (_, i) => i,
  );
  const metricColumnIndexes = Array.from(
    { length: cols.length - projectionCount },
    (_, i) => projectionCount + i,
  );
  const rowColumnIndexes = keepSeriesColumn
    ? [...dimensionColumnIndexes, seriesColumnIndex, ...metricColumnIndexes]
    : [...dimensionColumnIndexes, ...metricColumnIndexes];

  const breakoutValues: RowValue[] = [];
  const breakoutRowsByValue = new Map<RowValue, RowValues[]>();

  for (const row of rows) {
    const seriesValue = row[seriesColumnIndex];
    let seriesRows = breakoutRowsByValue.get(seriesValue);
    if (!seriesRows) {
      seriesRows = [];
      breakoutRowsByValue.set(seriesValue, seriesRows);
      breakoutValues.push(seriesValue);
      if (breakoutValues.length > MAX_SERIES) {
        return [series];
      }
    }
    seriesRows.push(rowColumnIndexes.map((i) => row[i]) as RowValues);
  }

  return breakoutValues.map((breakoutValue, i) => {
    const name = [
      seriesCount > 1 && card.name,
      formatValue(isEmpty(breakoutValue) ? NULL_DISPLAY_VALUE : breakoutValue, {
        column: cols[seriesColumnIndex],
      }),
    ]
      .filter(Boolean)
      .join(": ");

    const seriesKey = getSeriesVizSettingsKey(
      cols[metricColumnIndexes[0]],
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
            color: sourceColors?.[i] as string,
          }),
        },
      },
      data: {
        ...data,
        rows: breakoutRowsByValue.get(breakoutValue)!,
        cols: rowColumnIndexes.map((i) => cols[i]),
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
  tab: MetricsViewerTabState,
  resultsByDefinitionId: Map<MetricSourceId, Dataset>,
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>,
  sourceColors: SourceColorMap,
): SingleSeries[] {
  const firstSettingsEntry = definitions.reduce<{
    def: MetricDefinition;
    dimension: DimensionMetadata;
  } | null>((found, entry) => {
    if (found) {
      return found;
    }
    const dimensionId = tab.dimensionMapping[entry.id];
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
    return [];
  }

  const vizSettings = DISPLAY_TYPE_REGISTRY[tab.display].getSettings(
    firstSettingsEntry.def,
    firstSettingsEntry.dimension,
  );

  return definitions.flatMap((entry) => {
    const dimensionId = tab.dimensionMapping[entry.id];
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
      result.data.cols[1], // TODO: There is almost certainly be a better way to do this
      false,
      true,
      1,
      null,
      name as string,
    );

    const singleSeries: SingleSeries = {
      card: createSeriesCard(cardId, name, tab.display, {
        ...vizSettings,
        ...computeColorVizSettings({
          displayType: tab.display,
          seriesKey,
          color: sourceColors[entry.id]?.[0] as string,
        }),
      }),
      data: result.data,
    };

    if (!entryHasBreakout(entry)) {
      return [singleSeries];
    }

    const projCount = LibMetric.projections(modDef).length;

    if (projCount > 1) {
      return splitByBreakout(
        singleSeries,
        definitions.length,
        projCount,
        false,
        sourceColors[entry.id],
      );
    }

    return splitByBreakout(
      singleSeries,
      definitions.length,
      projCount,
      true,
      sourceColors[entry.id],
    );
  });
}

function computeColorVizSettings({
  displayType,
  seriesKey,
  color,
}: {
  displayType: VisualizationDisplay;
  seriesKey: string;
  color: string;
}): Partial<Pick<VisualizationSettings, "series_settings" | "map.colors">> {
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
  tab: MetricsViewerTabState,
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>,
  sourceColors: SourceColorMap,
  dimensionFilter?: (dimension: LibMetric.DimensionMetadata) => boolean,
): DimensionItem[] {
  return definitions.flatMap((entry): DimensionItem[] => {
    if (!entry.definition) {
      return [];
    }

    const dimensionId = tab.dimensionMapping[entry.id];
    const entryColors = sourceColors[entry.id];
    const modifiedDefinition = modifiedDefinitions.get(entry.id);

    if (dimensionId !== undefined && modifiedDefinition) {
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

    if (availableOptions.length === 0) {
      return [];
    }

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
          name: entry.id,
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
      return [
        {
          id: measureId,
          sourceType: "measure",
          name,
          isLoading,
        },
      ];
    }

    return [];
  });
}
