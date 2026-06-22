import type { QueryDatasetResult } from "embedding-sdk-bundle/lib/query-dataset";
import type { QueryQuestionResult } from "embedding-sdk-bundle/lib/query-question";

import type { QueryData } from "../data-schema";
import { mapRowsToObjects } from "../data-schema";

export const mapDatasetQueryData = <TRow>(
  result: QueryQuestionResult | QueryDatasetResult,
): QueryData<TRow> => ({
  ...result,
  rows: mapRowsToObjects<TRow>(result.columns, result.rows),
  rawRows: result.rows,
});
