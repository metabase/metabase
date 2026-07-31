import type { DatasetQuery, VisualizationDisplay } from "metabase-types/api";

import {
  type GetColor,
  type UsageStatsMetric,
  getMetricSeriesSettings,
} from "./query-utils";

type RawDataCol = { source?: string; name?: string };
type RawData = { cols: RawDataCol[]; rows: unknown[][] };
type AdhocResponse = { data?: RawData } | undefined;

type Opts = {
  metric: UsageStatsMetric;
  display: VisualizationDisplay;
  maxCategories?: number;
  otherLabel: string;
  getColor: GetColor;
};

function breakoutIndices(cols: RawDataCol[]): number[] {
  return cols
    .map((c, i) => (c.source === "breakout" ? i : -1))
    .filter((i) => i >= 0);
}

export function mapBreakoutDimension(
  response: AdhocResponse,
  fn: (value: unknown) => unknown,
  which: "dimension" | "series" = "dimension",
): AdhocResponse {
  if (!response?.data) {
    return response;
  }
  const indices = breakoutIndices(response.data.cols);
  const targetIndex = which === "dimension" ? indices[0] : indices[1];
  if (targetIndex == null) {
    return response;
  }
  const rows = response.data.rows.map((row) => {
    const next = fn(row[targetIndex]);
    if (next === row[targetIndex]) {
      return row;
    }
    const copy = [...row];
    copy[targetIndex] = next;
    return copy;
  });
  return { ...response, data: { ...response.data, rows } };
}

function sumMetricColumns(row: unknown[], metricIndices: number[]): number {
  return metricIndices.reduce((s, i) => s + (Number(row[i]) || 0), 0);
}

function totalsByDimension(
  rows: unknown[][],
  dimensionIndex: number,
  metricIndices: number[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[dimensionIndex]);
    const prev = totals.get(key) ?? 0;
    totals.set(key, prev + sumMetricColumns(row, metricIndices));
  }
  return totals;
}

function sortRowsByDimensionTotal(
  rows: unknown[][],
  dimensionIndex: number,
  metricIndices: number[],
): unknown[][] {
  const totals = totalsByDimension(rows, dimensionIndex, metricIndices);
  return [...rows].sort((a, b) => {
    const aKey = String(a[dimensionIndex]);
    const bKey = String(b[dimensionIndex]);
    const diff = (totals.get(bKey) ?? 0) - (totals.get(aKey) ?? 0);
    if (diff !== 0) {
      return diff;
    }
    if (aKey !== bKey) {
      return aKey < bKey ? -1 : 1;
    }
    return (
      sumMetricColumns(b, metricIndices) - sumMetricColumns(a, metricIndices)
    );
  });
}

function collapseToTopN(
  rows: unknown[][],
  dimensionIndex: number,
  seriesIndex: number | undefined,
  metricIndices: number[],
  max: number | undefined,
  otherLabel: string,
  colCount: number,
): unknown[][] {
  if (max == null || dimensionIndex < 0 || metricIndices.length === 0) {
    return rows;
  }

  const totals = totalsByDimension(rows, dimensionIndex, metricIndices);
  if (totals.size <= max) {
    return rows;
  }

  const kept = new Set(
    [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, max - 1)
      .map(([key]) => key),
  );

  const keptRows = rows.filter((row) => kept.has(String(row[dimensionIndex])));
  const overflow = rows.filter((row) => !kept.has(String(row[dimensionIndex])));

  const makeOtherRow = (seriesValue?: unknown): unknown[] => {
    const row: unknown[] = new Array(colCount).fill(null);
    row[dimensionIndex] = otherLabel;
    if (seriesIndex != null) {
      row[seriesIndex] = seriesValue;
    }
    for (const i of metricIndices) {
      row[i] = 0;
    }
    return row;
  };

  const addInto = (target: unknown[], source: unknown[]) => {
    for (const i of metricIndices) {
      target[i] = (Number(target[i]) || 0) + (Number(source[i]) || 0);
    }
  };

  if (seriesIndex == null) {
    const otherRow = makeOtherRow();
    for (const row of overflow) {
      addInto(otherRow, row);
    }
    return [...keptRows, otherRow];
  }

  const otherBySeries = new Map<string, unknown[]>();
  for (const row of overflow) {
    const key = String(row[seriesIndex]);
    let target = otherBySeries.get(key);
    if (!target) {
      target = makeOtherRow(row[seriesIndex]);
      otherBySeries.set(key, target);
    }
    addInto(target, row);
  }
  return [...keptRows, ...otherBySeries.values()];
}

export function toBreakoutRawSeries(
  response: AdhocResponse,
  jsQuery: DatasetQuery | null,
  opts: Opts,
) {
  if (!response?.data || !jsQuery) {
    return null;
  }

  const { metric, display, maxCategories, otherLabel, getColor } = opts;
  const cols = response.data.cols;
  const [dimensionIndex = -1, seriesIndex] = breakoutIndices(cols);
  const metricIndices = cols
    .map((c, i) => (c.source === "aggregation" ? i : -1))
    .filter((i) => i >= 0);
  const aggregationColumnNames = metricIndices.map((i) => cols[i].name ?? "");
  const hasModelSeries = seriesIndex != null;

  const rows =
    dimensionIndex >= 0
      ? sortRowsByDimensionTotal(
          response.data.rows,
          dimensionIndex,
          metricIndices,
        )
      : response.data.rows;

  return [
    {
      card: {
        display,
        dataset_query: jsQuery,
        visualization_settings: {
          "graph.x_axis.title_text": "",
          "graph.y_axis.title_text": "",
          ...(display === "bar" && {
            "graph.x_axis.axis_enabled": "compact",
          }),
          ...(hasModelSeries && {
            "graph.dimensions": [
              cols[dimensionIndex]?.name ?? "",
              cols[seriesIndex]?.name ?? "",
            ],
            "stackable.stack_type": "stacked",
          }),
          ...getMetricSeriesSettings(metric, getColor, aggregationColumnNames, {
            hasModelSeries,
          }),
        },
      },
      data: {
        ...response.data,
        rows: collapseToTopN(
          rows,
          dimensionIndex,
          seriesIndex,
          metricIndices,
          maxCategories,
          otherLabel,
          cols.length,
        ),
      },
    },
  ];
}
