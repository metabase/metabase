import type { Dataset } from "metabase-types/api";

/**
 * Pick the columns to use as `graph.dimensions` for an exploration query.
 * Matches the heuristic used by `Lib.defaultDisplay`: when the dataset has
 * three columns we treat the layout as date + breakout + metric and pin the
 * date as the x-axis and the breakout as the series, otherwise we let the
 * viz layer infer the dimensions.
 *
 * Shared between `ExplorationVisualization` (single query) and
 * `ExplorationGroupVisualization` (multi-query `page` group) so both render
 * with consistent dimension assignments.
 */
export function getDimensions(dataset: Dataset): string[] | undefined {
  const cols = dataset.data.cols;
  if (cols.length === 3) {
    // The first column is the date column and should be the x-axis;
    // the second column is the breakout. Provide them explicitly,
    // otherwise viz settings might swap them based on cardinality.
    return [cols[0]?.name, cols[1]?.name].filter(
      (name): name is string => typeof name === "string",
    );
  }
  return undefined;
}
