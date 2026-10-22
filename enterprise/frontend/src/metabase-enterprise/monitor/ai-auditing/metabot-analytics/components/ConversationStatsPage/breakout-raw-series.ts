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

export function mapBreakoutDimension(
  response: AdhocResponse,
  fn: (value: unknown) => unknown,
): AdhocResponse {
  if (!response?.data) {
    return response;
  }
  const dimensionIndex = response.data.cols.findIndex(
    (c) => c.source === "breakout",
  );
  if (dimensionIndex < 0) {
    return response;
  }
  const rows = response.data.rows.map((row) => {
    const next = fn(row[dimensionIndex]);
    if (next === row[dimensionIndex]) {
      return row;
    }
    const copy = [...row];
    copy[dimensionIndex] = next;
    return copy;
  });
  return { ...response, data: { ...response.data, rows } };
}

function sumMetricColumns(row: unknown[], metricIndices: number[]): number {
  return metricIndices.reduce((s, i) => s + (Number(row[i]) || 0), 0);
}

function sortRowsByCombinedMetric(
  rows: unknown[][],
  metricIndices: number[],
): unknown[][] {
  return [...rows]
    .map((row) => ({ row, total: sumMetricColumns(row, metricIndices) }))
    .sort((a, b) => b.total - a.total)
    .map(({ row }) => row);
}

function collapseToTopN(
  rows: unknown[][],
  dimensionIndex: number,
  metricIndices: number[],
  max: number | undefined,
  otherLabel: string,
  colCount: number,
): unknown[][] {
  const shouldCollapse =
    max != null &&
    dimensionIndex >= 0 &&
    metricIndices.length > 0 &&
    rows.length > max;
  if (!shouldCollapse) {
    return rows;
  }
  const keep = rows.slice(0, max - 1);
  const overflow = rows.slice(max - 1);
  const otherRow: unknown[] = new Array(colCount).fill(null);
  otherRow[dimensionIndex] = otherLabel;
  for (const i of metricIndices) {
    otherRow[i] = overflow.reduce((sum, row) => sum + (Number(row[i]) || 0), 0);
  }
  return [...keep, otherRow];
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
  const dimensionIndex = cols.findIndex((c) => c.source === "breakout");
  const metricIndices = cols
    .map((c, i) => (c.source === "aggregation" ? i : -1))
    .filter((i) => i >= 0);
  const aggregationColumnNames = metricIndices.map((i) => cols[i].name ?? "");

  const needsCombinedMetricSort = metricIndices.length > 1;
  const rows = needsCombinedMetricSort
    ? sortRowsByCombinedMetric(response.data.rows, metricIndices)
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
          ...getMetricSeriesSettings(metric, getColor, aggregationColumnNames),
        },
      },
      data: {
        ...response.data,
        rows: collapseToTopN(
          rows,
          dimensionIndex,
          metricIndices,
          maxCategories,
          otherLabel,
          cols.length,
        ),
      },
    },
  ];
}
