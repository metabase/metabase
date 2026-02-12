import type { DimensionOption } from "metabase/common/components/DimensionPill";
import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting/value";
import {
  getColors,
  keyForSingleSeries,
} from "metabase/visualizations/lib/settings/series";
import { MAX_SERIES } from "metabase/visualizations/lib/utils";
import { transformSeries } from "metabase/visualizations/visualizations/CartesianChart/chart-definition-legacy";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type {
  Dataset,
  SingleSeries,
  VisualizationSettings,
} from "metabase-types/api";

import { getDefinitionName } from "../adapters/definition-loader";
import type {
  DefinitionId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
  SelectedMetric,
  SourceColorMap,
} from "../types/viewer-state";

import { buildExecutableDefinition, isDimensionCandidate } from "./queries";
import {
  cardIdToMeasureId,
  isMeasureCardId,
  measureToCardId,
  parseSourceId,
} from "./source-ids";
import { DISPLAY_TYPE_REGISTRY } from "./tab-config";
import { getDimensionIcon } from "./tabs";

// ── Breakout types ──

const BREAKOUT_ID_OFFSET = 1_000_000;
let breakoutIdCounter = 0;

function nextBreakoutCardId(): number {
  return BREAKOUT_ID_OFFSET + ++breakoutIdCounter;
}

export type BreakoutSeriesColor = {
  breakoutValue: unknown;
  displayValue: string;
  color: string;
};

// ── Breakout series splitting ──

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

export function splitBreakoutSeries(
  series: SingleSeries,
  breakoutColIndex: number,
  isMultiMetric: boolean,
): SingleSeries[] {
  const { card, data } = series;
  const { cols, rows } = data;

  const keepIndexes = cols
    .map((_: unknown, i: number) => i)
    .filter((i: number) => i !== breakoutColIndex);

  const breakoutValues: unknown[] = [];
  const rowsByValue = new Map<unknown, unknown[][]>();

  for (const row of rows) {
    const val = row[breakoutColIndex];
    let group = rowsByValue.get(val);
    if (!group) {
      rowsByValue.set(val, (group = []));
      breakoutValues.push(val);
      if (breakoutValues.length > MAX_SERIES) {
        return [series];
      }
    }
    group.push(keepIndexes.map((i: number) => row[i]));
  }

  const breakoutCol = cols[breakoutColIndex];
  const keptCols = keepIndexes.map((i: number) => cols[i]);

  return breakoutValues.map((breakoutValue) => {
    const displayValue = formatValue(
      isEmptyValue(breakoutValue) ? NULL_DISPLAY_VALUE : breakoutValue,
      { column: breakoutCol },
    );
    const name = isMultiMetric
      ? `${card.name}: ${displayValue}`
      : String(displayValue);

    return {
      ...series,
      card: {
        ...card,
        id: nextBreakoutCardId(),
        name,
        originalCardName: card.name,
        _breakoutValue: breakoutValue,
        _breakoutColumn: breakoutCol,
        _sourceCardId: card.id,
      } as SingleSeries["card"],
      data: {
        ...data,
        cols: keptCols,
        rows: rowsByValue.get(breakoutValue)!,
        _rawCols: cols,
        _transformed: true,
      } as SingleSeries["data"],
    };
  });
}

export function computeSourceColors(
  definitions: MetricsViewerDefinitionEntry[],
): SourceColorMap {
  if (definitions.length === 0) {
    return {};
  }

  const keys: string[] = [];
  const numericIds: number[] = [];

  for (let i = 0; i < definitions.length; i++) {
    const entry = definitions[i];
    if (!entry.definition) {
      continue;
    }
    const name = getDefinitionName(entry.definition);

    const metricId = LibMetric.sourceMetricId(entry.definition);
    const measureId = LibMetric.sourceMeasureId(entry.definition);
    numericIds.push(metricId ?? measureId ?? 0);

    if (!name) {
      keys.push(entry.id);
    } else {
      keys.push(name);
    }
  }

  if (keys.length === 0) {
    return {};
  }

  const colorMapping = getColorsForValues(keys);

  const idToColor: Record<number, string> = {};
  for (let i = 0; i < numericIds.length; i++) {
    idToColor[numericIds[i]] = colorMapping[keys[i]];
  }

  return idToColor;
}

export function computeColorsFromRawSeries(
  rawSeries: SingleSeries[],
): SourceColorMap {
  if (rawSeries.length === 0) {
    return {};
  }

  const transformed = transformSeries(rawSeries);
  const colorMapping = getColors(transformed, {});

  const result: SourceColorMap = {};
  for (const s of transformed) {
    const key = keyForSingleSeries(s);
    const color = colorMapping[key];
    const cardExtra = s.card as unknown as Record<string, unknown>;
    const originalCardId =
      (cardExtra._sourceCardId as number) ?? s.card.id;
    if (color && originalCardId != null) {
      const sourceId = isMeasureCardId(originalCardId)
        ? cardIdToMeasureId(originalCardId)
        : originalCardId;
      if (!(sourceId in result)) {
        result[sourceId] = color;
      }
    }
  }
  return result;
}

export function computeBreakoutColors(
  rawSeries: SingleSeries[],
): Map<number, BreakoutSeriesColor[]> {
  const breakoutSeries = rawSeries.filter(
    (s) =>
      (s.card as unknown as Record<string, unknown>)._breakoutValue !==
      undefined,
  );
  if (breakoutSeries.length === 0) {
    return new Map();
  }

  const colorMapping = getColors(rawSeries, {}) as Record<string, string>;
  const result = new Map<number, BreakoutSeriesColor[]>();

  for (const s of breakoutSeries) {
    const key = keyForSingleSeries(s);
    const color = colorMapping[key];
    const cardExtra = s.card as unknown as Record<string, unknown>;
    const originalCardId = (cardExtra._sourceCardId as number) ?? s.card.id;
    if (!color || originalCardId == null) {
      continue;
    }

    const sourceId = isMeasureCardId(originalCardId)
      ? cardIdToMeasureId(originalCardId)
      : originalCardId;
    const list = result.get(sourceId) ?? [];
    list.push({
      breakoutValue: (s.card as unknown as Record<string, unknown>)
        ._breakoutValue,
      displayValue: String(s.card.name),
      color,
    });
    result.set(sourceId, list);
  }
  return result;
}

export function buildRawSeriesFromDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState,
  resultsByDefinitionId: Map<DefinitionId, Dataset>,
  modifiedDefinitions: Map<DefinitionId, MetricDefinition | null>,
): SingleSeries[] {
  const validSeries: SingleSeries[] = [];
  let vizSettings: VisualizationSettings | null = null;
  const isMultiMetric = tab.definitions.length > 1;

  for (const tabDef of tab.definitions) {
    const entry = definitions.find((d) => d.id === tabDef.definitionId);
    if (!entry || !entry.definition) {
      continue;
    }

    const modDef = modifiedDefinitions.get(entry.id);
    const result = resultsByDefinitionId.get(entry.id);

    if (!modDef || !result?.data?.cols?.length) {
      continue;
    }

    const projs = LibMetric.projections(modDef);
    if (projs.length === 0) {
      continue;
    }

    if (vizSettings === null) {
      vizSettings = DISPLAY_TYPE_REGISTRY[tab.display].getSettings(modDef);
    }

    const hasBreakout =
      entry.breakoutDimensionId != null &&
      entry.breakoutDimensionId !== tabDef.projectionDimensionId;

    // For breakout series, viz settings should only reference the primary dimension
    let seriesVizSettings = vizSettings;
    if (hasBreakout && vizSettings) {
      const dims = vizSettings["graph.dimensions"] as string[] | undefined;
      if (dims && dims.length > 1) {
        seriesVizSettings = {
          ...vizSettings,
          "graph.dimensions": [dims[0]],
        };
      }
    }

    const metricId = LibMetric.sourceMetricId(entry.definition);
    const measureId = LibMetric.sourceMeasureId(entry.definition);
    const name = getDefinitionName(entry.definition);
    const cardId =
      metricId != null
        ? metricId
        : measureId != null
          ? measureToCardId(measureId)
          : null;

    if (cardId === null) {
      continue;
    }

    const syntheticCard = {
      id: cardId,
      name,
      display: tab.display,
      visualization_settings: seriesVizSettings,
    };
    const singleSeries: SingleSeries = {
      card: syntheticCard as SingleSeries["card"],
      data: result.data,
    };

    if (hasBreakout) {
      const breakoutColIndex = result.data.cols.findIndex(
        (col: { name: string }) => col.name === entry.breakoutDimensionId,
      );
      if (breakoutColIndex !== -1) {
        const splitSeries = splitBreakoutSeries(
          singleSeries,
          breakoutColIndex,
          isMultiMetric,
        );
        validSeries.push(...splitSeries);
      } else {
        validSeries.push(singleSeries);
      }
    } else {
      validSeries.push(singleSeries);
    }
  }

  return validSeries;
}

function computeAvailableOptions(
  def: MetricDefinition,
  dimensionFilter?: (dim: LibMetric.DimensionMetadata) => boolean,
): DimensionOption[] {
  const dims = LibMetric.projectionableDimensions(def);
  const filtered = dimensionFilter
    ? dims.filter(dimensionFilter)
    : dims;

  return filtered.map((dim) => {
    const info = LibMetric.displayInfo(def, dim);
    return {
      name: info.name!,
      displayName: info.displayName,
      icon: getDimensionIcon(dim),
      group: info.group,
    };
  });
}

export function buildDimensionItemsFromDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState,
  modifiedDefinitions: Map<DefinitionId, MetricDefinition | null>,
  sourceColors: SourceColorMap,
  dimensionFilter?: (dim: LibMetric.DimensionMetadata) => boolean,
  breakoutColorsByMetricId?: Map<number, BreakoutSeriesColor[]>,
): DimensionItem[] {
  const items: DimensionItem[] = [];
  const tabDefBySourceId = new Map(
    tab.definitions.map((td) => [td.definitionId, td]),
  );

  for (const entry of definitions) {
    const tabDef = tabDefBySourceId.get(entry.id);
    if (!tabDef || !entry.definition) {
      continue;
    }

    const modDef = modifiedDefinitions.get(entry.id);
    const { id: numericId } = parseSourceId(entry.id);

    if (!modDef) {
      if (!tabDef.projectionDimensionId) {
        items.push({
          id: entry.id,
          label: undefined,
          icon: undefined,
          color: sourceColors[numericId],
          availableOptions: computeAvailableOptions(
            entry.definition,
            dimensionFilter,
          ),
        });
      }
      continue;
    }

    const projs = LibMetric.projections(modDef);
    if (projs.length === 0) {
      continue;
    }

    const dim = LibMetric.projectionDimension(modDef, projs[0]);
    if (!dim) {
      continue;
    }

    const dimInfo = LibMetric.displayInfo(modDef, dim);

    const breakoutColors = breakoutColorsByMetricId?.get(numericId);
    items.push({
      id: entry.id,
      label: dimInfo.longDisplayName,
      icon: getDimensionIcon(dim),
      color: sourceColors[numericId],
      colors: breakoutColors?.map((bc) => bc.color),
      availableOptions: computeAvailableOptions(
        entry.definition,
        dimensionFilter,
      ),
    });
  }

  return items;
}

function isBreakoutCandidate(dim: LibMetric.DimensionMetadata): boolean {
  return isDimensionCandidate(dim) && LibMetric.isCategory(dim);
}

export function computeBreakoutOptionsForDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
): Map<number, DimensionOption[]> {
  const result = new Map<number, DimensionOption[]>();
  for (const entry of definitions) {
    if (!entry.definition) {
      continue;
    }
    const { id: numericId } = parseSourceId(entry.id);
    const dims = LibMetric.projectionableDimensions(entry.definition).filter(
      isBreakoutCandidate,
    );
    const options = dims.map((dim) => {
      const info = LibMetric.displayInfo(entry.definition!, dim);
      return {
        name: info.name!,
        displayName: info.displayName,
        icon: getDimensionIcon(dim),
        group: info.group,
      };
    });
    result.set(numericId, options);
  }
  return result;
}

export function getSelectedMetricsInfo(
  definitions: MetricsViewerDefinitionEntry[],
  loadingIds: Set<DefinitionId>,
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

    const name = getDefinitionName(definition);
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
): Map<DefinitionId, MetricDefinition | null> {
  const result = new Map<DefinitionId, MetricDefinition | null>();

  for (const tabDef of tab.definitions) {
    const entry = definitions.find((d) => d.id === tabDef.definitionId);
    if (!entry || !entry.definition) {
      result.set(tabDef.definitionId, null);
      continue;
    }

    const execDef = buildExecutableDefinition(
      entry.definition,
      tab,
      tabDef.projectionDimensionId,
      entry.breakoutDimensionId,
    );
    result.set(entry.id, execDef);
  }

  return result;
}
