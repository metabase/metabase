import type { DimensionOption } from "metabase/common/components/DimensionPill";
import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { formatValue } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { MAX_SERIES } from "metabase/visualizations/lib/utils";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import { isMetric as isMetricColumn } from "metabase-lib/v1/types/utils/isa";
import type {
  Card,
  Dataset,
  DatasetColumn,
  SingleSeries,
  VisualizationSettings,
} from "metabase-types/api";

import { getDefinitionName } from "../adapters/definition-loader";
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
import { measureToCardId, parseSourceId } from "./source-ids";
import { DISPLAY_TYPE_REGISTRY } from "./tab-config";
import { getDimensionIcon } from "./tabs";

function getDefinitionCardId(def: MetricDefinition): number | null {
  const metricId = LibMetric.sourceMetricId(def);
  if (metricId != null) {
    return metricId;
  }
  const measureId = LibMetric.sourceMeasureId(def);
  if (measureId != null) {
    return measureToCardId(measureId);
  }
  return null;
}

export function computeSourceColors(
  definitions: MetricsViewerDefinitionEntry[],
): SourceColorMap {
  const loaded = definitions.filter(
    (entry): entry is MetricsViewerDefinitionEntry & { definition: MetricDefinition } =>
      entry.definition != null,
  );

  if (loaded.length === 0) {
    return {};
  }

  const names = loaded.map(
    (entry) => getDefinitionName(entry.definition) ?? entry.id,
  );
  const colorMapping = getColorsForValues(names);

  const result: SourceColorMap = {};
  for (let i = 0; i < loaded.length; i++) {
    result[loaded[i].id] = [colorMapping[names[i]]];
  }
  return result;
}

/**
 * Computes the series color key the same way the chart pipeline does
 * (transformSeries → keyForSingleSeries), but without any data manipulation.
 *
 * The chart pipeline (transformSingleSeries) resolves graph.metrics via
 * getComputedSettingsForSeries, finds the metric column, then:
 *   seriesIndex === 0  →  key = metricCol.name   (e.g. "count")
 *   seriesIndex  > 0   →  key = card.name         (e.g. "Revenue")
 * For a single series it also appends metricCol.display_name.
 *
 * We replicate that logic directly, skipping the heavy settings computation
 * and row-level data transformation that the chart needs for rendering.
 */
function computeSeriesKey(
  s: SingleSeries,
  seriesIndex: number,
  totalSeriesCount: number,
): string {
  const metricCol = findMetricColumn(s);

  const name = [
    totalSeriesCount > 1 && s.card.name,
    totalSeriesCount === 1 && metricCol?.display_name,
  ]
    .filter(Boolean)
    .join(": ");

  return seriesIndex === 0 && metricCol ? metricCol.name : name;
}

function findMetricColumn(s: SingleSeries): DatasetColumn | undefined {
  return s.data.cols.find(
    (col: DatasetColumn) => isMetricColumn(col) && !col.binning_info,
  );
}

export function computeColorsFromRawSeries(
  rawSeries: SingleSeries[],
  cardIdsByDefinition: Map<MetricSourceId, number[]>,
): SourceColorMap {
  if (rawSeries.length === 0) {
    return {};
  }

  const keys = rawSeries.map((s, i) =>
    computeSeriesKey(s, i, rawSeries.length),
  );
  const colorMapping = getColorsForValues(keys);

  const colorByCardId = new Map<number, string>(
    rawSeries.flatMap((s, i) => {
      const color = colorMapping[keys[i]];
      return color && s.card.id != null
        ? ([[s.card.id, color]] as [number, string][])
        : [];
    }),
  );

  return Object.fromEntries(
    [...cardIdsByDefinition.entries()].flatMap(([defId, cardIds]) => {
      const colors = cardIds.flatMap((id) => {
        const c = colorByCardId.get(id);
        return c ? [c] : [];
      });
      return colors.length > 0 ? [[defId, colors]] : [];
    }),
  );
}

const SYNTHETIC_CARD_ID_OFFSET = -2_000_000;

function createIdGenerator(): () => number {
  let counter = 0;
  return () => SYNTHETIC_CARD_ID_OFFSET - counter++;
}

function splitSingleSeries(
  s: SingleSeries,
  seriesCount: number,
  nextId: () => number,
): SingleSeries[] {
  const { card, data } = s;
  const { cols, rows } = data;
  const settings = getComputedSettingsForSeries([s]);

  const dimensions = (
    (settings["graph.dimensions"] as string[] | undefined) ?? []
  ).filter((d) => d != null);
  const metrics = (
    (settings["graph.metrics"] as string[] | undefined) ?? []
  ).filter((d) => d != null);

  const dimensionColumnIndexes = dimensions.map((name) =>
    cols.findIndex((col) => col.name === name),
  );
  const metricColumnIndexes = metrics.map((name) =>
    cols.findIndex((col) => col.name === name),
  );

  const bubbleCol = settings["scatter.bubble"] as string | undefined;
  const bubbleColumnIndex =
    bubbleCol != null ? cols.findIndex((col) => col.name === bubbleCol) : -1;
  const extraColumnIndexes = bubbleColumnIndex >= 0 ? [bubbleColumnIndex] : [];

  if (dimensions.length > 1) {
    const [dimensionColumnIndex, seriesColumnIndex] = dimensionColumnIndexes;
    const rowColumnIndexes = [
      dimensionColumnIndex,
      ...metricColumnIndexes,
      ...extraColumnIndexes,
    ];

    const breakoutValues: unknown[] = [];
    const breakoutRowsByValue = new Map<unknown, unknown[][]>();

    for (const row of rows) {
      const seriesValue = row[seriesColumnIndex];
      let seriesRows = breakoutRowsByValue.get(seriesValue);
      if (!seriesRows) {
        seriesRows = [];
        breakoutRowsByValue.set(seriesValue, seriesRows);
        breakoutValues.push(seriesValue);

        if (breakoutValues.length > MAX_SERIES) {
          return [s];
        }
      }
      seriesRows.push(rowColumnIndexes.map((i) => row[i]));
    }

    const splitSettings: VisualizationSettings = {
      ...card.visualization_settings,
      "graph.dimensions": [dimensions[0]],
      "graph.metrics": metrics,
    };

    return breakoutValues.map((breakoutValue) => ({
      ...s,
      card: {
        ...card,
        id: nextId(),
        name: [
          seriesCount > 1 && card.name,
          formatValue(
            isEmpty(breakoutValue) ? NULL_DISPLAY_VALUE : breakoutValue,
            { column: cols[seriesColumnIndex] },
          ),
        ]
          .filter(Boolean)
          .join(": "),
        visualization_settings: splitSettings,
      },
      data: {
        ...data,
        rows: breakoutRowsByValue.get(breakoutValue)!,
        cols: rowColumnIndexes.map((i) => cols[i]),
      },
    }));
  }

  const dimensionColumnIndex = dimensionColumnIndexes[0];
  return metricColumnIndexes.map((metricColumnIndex) => {
    const col = cols[metricColumnIndex];
    const rowColumnIndexes = [
      dimensionColumnIndex,
      metricColumnIndex,
      ...extraColumnIndexes,
    ];
    const name = [
      seriesCount > 1 && card.name,
      (metricColumnIndexes.length > 1 || seriesCount === 1) &&
        col?.display_name,
    ]
      .filter(Boolean)
      .join(": ");

    return {
      ...s,
      card: { ...card, name },
      data: {
        ...data,
        rows: rows.map((row) => rowColumnIndexes.map((i) => row[i])),
        cols: rowColumnIndexes.map((i) => cols[i]),
      },
    };
  });
}

export function splitRawSeries(series: SingleSeries[]): SingleSeries[] {
  const nextId = createIdGenerator();
  const result = series.flatMap((s) =>
    splitSingleSeries(s, series.length, nextId),
  );
  return result.length === 0 ? series : result;
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

export interface RawSeriesBuildResult {
  series: SingleSeries[];
  cardIdsByDefinition: Map<MetricSourceId, number[]>;
}

export function buildRawSeriesFromDefinitions(
  definitions: MetricsViewerDefinitionEntry[],
  tab: MetricsViewerTabState,
  resultsByDefinitionId: Map<MetricSourceId, Dataset>,
  modifiedDefinitions: Map<MetricSourceId, MetricDefinition>,
): RawSeriesBuildResult {
  const empty: RawSeriesBuildResult = {
    series: [],
    cardIdsByDefinition: new Map(),
  };

  const firstModDef = tab.definitions.reduce<MetricDefinition | null>(
    (found, td) => found ?? modifiedDefinitions.get(td.definitionId) ?? null,
    null,
  );

  if (!firstModDef) {
    return empty;
  }

  const vizSettings =
    DISPLAY_TYPE_REGISTRY[tab.display].getSettings(firstModDef);
  const nextId = createIdGenerator();

  const processed = tab.definitions.flatMap((tabDef) => {
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
        vizSettings,
      ),
      data: result.data,
    };

    const produced = entry.breakoutDimension
      ? splitSingleSeries(singleSeries, definitions.length, nextId)
      : [singleSeries];

    return [{ defId: entry.id, series: produced }];
  });

  return {
    series: processed.flatMap((p) => p.series),
    cardIdsByDefinition: new Map(
      processed.map((p) => [p.defId, p.series.map((s) => s.card.id)]),
    ),
  };
}

function computeAvailableOptions(
  baseDef: MetricDefinition,
  modifiedDef: MetricDefinition | undefined,
  breakoutDimension: LibMetric.DimensionMetadata | undefined,
  dimensionFilter?: (dim: LibMetric.DimensionMetadata) => boolean,
): DimensionOption[] {
  const def = modifiedDef ?? baseDef;
  const dims = LibMetric.projectionableDimensions(def);
  const filtered = dimensionFilter ? dims.filter(dimensionFilter) : dims;

  return filtered.flatMap((dim) => {
    const info = LibMetric.displayInfo(def, dim);
    if (!info.name) {
      return [];
    }
    const isBreakout =
      breakoutDimension != null &&
      LibMetric.isSameSource(dim, breakoutDimension);
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
        execDef = applyBreakoutDimension(execDef, entry.breakoutDimension);
      }
      return [[entry.id, execDef] as const];
    }),
  );
}
