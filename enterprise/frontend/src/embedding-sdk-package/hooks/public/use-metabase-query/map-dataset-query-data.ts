import type { QueryDatasetResult } from "embedding-sdk-bundle/lib/query-dataset";
import type { QueryMetricResult } from "embedding-sdk-bundle/lib/query-metric";
import type { QueryQuestionResult } from "embedding-sdk-bundle/lib/query-question";

import type { QueryData } from "../data-schema";
import { mapRowsToObjects } from "../data-schema";

export function mapDatasetQueryData<TRow>(
  result: QueryQuestionResult | QueryDatasetResult | QueryMetricResult,
): QueryData<TRow> {
  return {
    ...result,
    rows: mapRowsToObjects<TRow>(result.columns, result.rows),
    rawRows: result.rows,
  };
}
