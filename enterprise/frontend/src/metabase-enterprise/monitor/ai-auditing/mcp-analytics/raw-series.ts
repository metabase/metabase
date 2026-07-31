import type { ColorName } from "metabase/ui/colors/types";
import type { DatasetQuery, VisualizationDisplay } from "metabase-types/api";

type GetColor = (name: ColorName) => string;

type RawDataCol = { source?: string; name?: string };
type RawData = { cols: RawDataCol[]; rows: unknown[][] };
type AdhocResponse = { data?: RawData } | undefined;

type Opts = {
  display: VisualizationDisplay;
  maxCategories?: number;
  otherLabel: string;
  getColor: GetColor;
};

/**
 * Keep the top `max - 1` rows (already count-ordered) and fold the remaining long tail into a
 * single "Other" row whose metric is the summed overflow. Returns rows unchanged when there's
 * nothing to collapse.
 */
function collapseToTopN(
  rows: unknown[][],
  dimensionIndex: number,
  metricIndex: number,
  max: number | undefined,
  otherLabel: string,
  colCount: number,
): unknown[][] {
  const shouldCollapse =
    max != null && dimensionIndex >= 0 && metricIndex >= 0 && rows.length > max;
  if (!shouldCollapse) {
    return rows;
  }
  const keep = rows.slice(0, max - 1);
  const overflow = rows.slice(max - 1);
  const otherRow: unknown[] = new Array(colCount).fill(null);
  otherRow[dimensionIndex] = otherLabel;
  otherRow[metricIndex] = overflow.reduce(
    (sum, row) => sum + (Number(row[metricIndex]) || 0),
    0,
  );
  return [...keep, otherRow];
}

/**
 * Build a single-breakout rawSeries (one dimension + the count metric) for `bar`/`row`/`pie`
 * displays. Long tails are collapsed into a single "Other" category.
 */
export function toCountBreakoutRawSeries(
  response: AdhocResponse,
  jsQuery: DatasetQuery | null,
  opts: Opts,
) {
  if (!response?.data || !jsQuery) {
    return null;
  }

  const { display, maxCategories, otherLabel, getColor } = opts;
  const cols = response.data.cols;
  const dimensionIndex = cols.findIndex((c) => c.source === "breakout");
  const metricIndex = cols.findIndex((c) => c.source === "aggregation");
  const dimensionName =
    dimensionIndex >= 0 ? cols[dimensionIndex].name : undefined;
  const countColumnName =
    metricIndex >= 0 ? (cols[metricIndex].name ?? "count") : "count";

  const visualizationSettings =
    display === "pie"
      ? {
          "pie.dimension": dimensionName,
          "pie.metric": countColumnName,
        }
      : {
          "graph.x_axis.title_text": "",
          "graph.y_axis.title_text": "",
          ...(display === "bar" && {
            "graph.x_axis.axis_enabled": "compact" as const,
          }),
          series_settings: {
            [countColumnName]: { color: getColor("accent0") },
          },
        };

  return [
    {
      card: {
        display,
        dataset_query: jsQuery,
        visualization_settings: visualizationSettings,
      },
      data: {
        ...response.data,
        rows: collapseToTopN(
          response.data.rows,
          dimensionIndex,
          metricIndex,
          maxCategories,
          otherLabel,
          cols.length,
        ),
      },
    },
  ];
}

/**
 * Build a multi-series line rawSeries from a two-breakout count query: the first breakout is
 * the x-axis dimension and the second becomes the series (e.g. day x client).
 */
export function toSeriesByBreakoutRawSeries(
  response: AdhocResponse,
  jsQuery: DatasetQuery | null,
) {
  if (!response?.data || !jsQuery) {
    return null;
  }

  const breakoutCols = response.data.cols.filter(
    (col) => col.source === "breakout",
  );
  const metricCol = response.data.cols.find(
    (col) => col.source === "aggregation",
  );
  const [dimensionCol, seriesCol] = breakoutCols;
  if (!dimensionCol?.name || !seriesCol?.name || !metricCol?.name) {
    return null;
  }

  return [
    {
      card: {
        display: "line" as const,
        dataset_query: jsQuery,
        visualization_settings: {
          "graph.dimensions": [dimensionCol.name, seriesCol.name],
          "graph.metrics": [metricCol.name],
          "graph.x_axis.title_text": "",
          "graph.y_axis.title_text": "",
        },
      },
      data: response.data,
    },
  ];
}
