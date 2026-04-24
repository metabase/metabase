import _ from "underscore";

import type { DatasetQuery, VisualizationDisplay } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { type UsageStatsMetric, getMetricSeriesSettings } from "./query-utils";

type RawDataCol = { source?: string; name?: string };
type RawData = { cols: RawDataCol[]; rows: unknown[][] };

type AdhocResponse = { data?: RawData } | undefined;

type Opts = {
  metric: UsageStatsMetric;
  display: VisualizationDisplay;
  nullLabel?: string;
  transformDimension?: (value: string) => string;
  maxCategories?: number;
  otherLabel: string;
};

export function toBreakoutRawSeries(
  response: AdhocResponse,
  jsQuery: DatasetQuery | null,
  opts: Opts,
) {
  if (!response?.data || !jsQuery) {
    return null;
  }

  const {
    metric,
    display,
    nullLabel,
    transformDimension,
    maxCategories,
    otherLabel,
  } = opts;

  const cols = response.data.cols;
  const dimensionIndex = cols.findIndex((c) => c.source === "breakout");
  const metricIndices = cols
    .map((c, i) => (c.source === "aggregation" ? i : -1))
    .filter((i) => i >= 0);
  const aggregationColumnNames = metricIndices.map((i) => cols[i].name ?? "");

  let rows = response.data.rows;

  if (metricIndices.length > 1) {
    const rowTotal = (row: (typeof rows)[number]) =>
      metricIndices.reduce((s, i) => s + (Number(row[i]) || 0), 0);
    rows = _.sortBy(rows, (row) => -rowTotal(row));
  }

  if (
    (nullLabel != null || transformDimension != null) &&
    dimensionIndex >= 0
  ) {
    rows = rows.map((row) => {
      const value = row[dimensionIndex];
      if (value == null && nullLabel != null) {
        const copy = [...row];
        copy[dimensionIndex] = nullLabel;
        return copy;
      }
      if (typeof value === "string" && transformDimension != null) {
        const copy = [...row];
        copy[dimensionIndex] = transformDimension(value);
        return copy;
      }
      return row;
    });
  }

  if (
    maxCategories != null &&
    dimensionIndex >= 0 &&
    metricIndices.length > 0 &&
    rows.length > maxCategories
  ) {
    const keep = rows.slice(0, maxCategories - 1);
    const overflow = rows.slice(maxCategories - 1);
    const otherRow: unknown[] = new Array(cols.length).fill(null);
    otherRow[dimensionIndex] = otherLabel;
    for (const i of metricIndices) {
      otherRow[i] = overflow.reduce(
        (sum, row) => sum + (Number(row[i]) || 0),
        0,
      );
    }
    rows = [...keep, otherRow as (typeof rows)[number]];
  }

  return [
    {
      card: createMockCard({
        dataset_query: jsQuery,
        display,
        visualization_settings: {
          "graph.x_axis.title_text": "",
          "graph.y_axis.title_text": "",
          ...(display === "bar" && {
            "graph.x_axis.axis_enabled": "compact",
          }),
          ...getMetricSeriesSettings(metric, aggregationColumnNames),
        },
      }),
      data: { ...response.data, rows },
    },
  ];
}
