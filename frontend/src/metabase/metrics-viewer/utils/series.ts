import type { DimensionOption } from "metabase/common/components/DimensionPill";
import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";
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

import {
  applyBreakoutDimension,
  buildExecutableDefinition,
  resolveDimension,
} from "./queries";
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
    if (entry.breakoutDimension && response && response.values.length > 0) {
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

  return breakoutValues.map((breakoutValue, i) => ({
    ...series,
    card: {
      ...card,
      id: nextSyntheticCardId(),
      name: [
        seriesCount > 1 && card.name,
        formatValue(
          isEmpty(breakoutValue) ? NULL_DISPLAY_VALUE : breakoutValue,
          { column: cols[seriesColumnIndex] },
        ),
      ]
        .filter(Boolean)
        .join(": "),
      visualization_settings: {
        color_override: sourceColors?.[i],
      },
    },
    data: {
      ...data,
      rows: breakoutRowsByValue.get(breakoutValue)!,
      cols: rowColumnIndexes.map((i) => cols[i]),
    },
  }));
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
  const firstSettingsEntry = tab.definitions.reduce<{
    def: MetricDefinition;
    dimension: DimensionMetadata;
  } | null>((found, td) => {
    if (found) {
      return found;
    }
    const entry = definitions.find((d) => d.id === td.definitionId);
    if (!entry?.definition) {
      return null;
    }
    const dimension = resolveDimension(entry.definition, td);
    if (!dimension) {
      return null;
    }
    const def = buildExecutableDefinition(entry.definition, tab, dimension);
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
  return tab.definitions.flatMap((tabDef) => {
    const entry = definitions.find((d) => d.id === tabDef.definitionId);
    if (!entry?.definition) {
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

    const singleSeries: SingleSeries = {
      card: createSeriesCard(
        cardId,
        getDefinitionName(entry.definition),
        tab.display,
        { ...vizSettings, color_override: sourceColors[entry.id]?.[0] },
      ),
      data: result.data,
    };

    if (!entry.breakoutDimension) {
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

function computeAvailableOptions(
  baseDef: MetricDefinition,
  modifiedDef: MetricDefinition | undefined,
  breakoutDimension: LibMetric.ProjectionClause | undefined,
  dimensionFilter?: (dim: LibMetric.DimensionMetadata) => boolean,
): DimensionOption[] {
  const def = modifiedDef ?? baseDef;
  const dims = LibMetric.projectionableDimensions(def);
  const filtered = dimensionFilter ? dims.filter(dimensionFilter) : dims;

  const breakoutRawDim = breakoutDimension
    ? LibMetric.projectionDimension(baseDef, breakoutDimension)
    : undefined;

  return filtered.flatMap((dim) => {
    const info = LibMetric.displayInfo(def, dim);
    if (!info.name) {
      return [];
    }
    const isBreakout =
      breakoutRawDim != null && LibMetric.isSameSource(dim, breakoutRawDim);
    return [
      {
        name: info.name,
        displayName: info.displayName,
        icon: getDimensionIcon(dim),
        dimension: dim,
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
  dimensionFilter?: (dim: LibMetric.DimensionMetadata) => boolean,
): DimensionItem[] {
  const tabDefBySourceId = new Map(
    tab.definitions.map((td) => [td.definitionId, td]),
  );

  return definitions.flatMap((entry): DimensionItem[] => {
    const tabDef = tabDefBySourceId.get(entry.id);
    if (!tabDef || !entry.definition) {
      return [];
    }

    const entryColors = sourceColors[entry.id];
    const modDef = modifiedDefinitions.get(entry.id);

    if (!modDef) {
      if (!tabDef.projectionDimension && !tabDef.projectionDimensionId) {
        return [
          {
            id: entry.id,
            label: undefined,
            icon: undefined,
            colors: entryColors,
            availableOptions: computeAvailableOptions(
              entry.definition,
              undefined,
              entry.breakoutDimension,
              dimensionFilter,
            ),
          },
        ];
      }
      return [];
    }

    const projs = LibMetric.projections(modDef);
    if (projs.length === 0) {
      return [];
    }

    const dim = LibMetric.projectionDimension(modDef, projs[0]);
    if (!dim) {
      return [];
    }

    const dimInfo = LibMetric.displayInfo(modDef, dim);

    return [
      {
        id: entry.id,
        label: dimInfo.longDisplayName,
        icon: getDimensionIcon(dim),
        colors: entryColors,
        availableOptions: computeAvailableOptions(
          entry.definition,
          modDef,
          entry.breakoutDimension,
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

export function computeModifiedDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState,
): Map<MetricSourceId, MetricDefinition> {
  return new Map(
    tab.definitions.flatMap((tabDef) => {
      const entry = definitions.find((d) => d.id === tabDef.definitionId);
      if (!entry?.definition) {
        return [];
      }
      const dimension = resolveDimension(entry.definition, tabDef);
      let execDef = buildExecutableDefinition(entry.definition, tab, dimension);
      if (!execDef) {
        return [];
      }
      if (entry.breakoutDimension) {
        const breakoutDim = LibMetric.projectionDimension(
          entry.definition,
          entry.breakoutDimension,
        );
        const hasExplicitBucket =
          LibMetric.temporalBucket(entry.breakoutDimension) !== null ||
          LibMetric.binning(entry.breakoutDimension) !== null;
        const isRedundant =
          !hasExplicitBucket &&
          dimension &&
          breakoutDim &&
          LibMetric.isSameSource(dimension, breakoutDim);
        if (!isRedundant) {
          execDef = applyBreakoutDimension(
            entry.definition,
            execDef,
            entry.breakoutDimension,
          );
        }
      }
      return [[entry.id, execDef] as const];
    }),
  );
}
