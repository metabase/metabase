import type { QueryDatasetResult } from "embedding-sdk-bundle/lib/query-dataset";
import type { QueryQuestionResult } from "embedding-sdk-bundle/lib/query-question";

import type { QueryData } from "../../../lib/public/data-schema";
import { mapRowsToObjects } from "../../../lib/public/data-schema";

export const mapDatasetQueryData = <TRow>(
  result: QueryQuestionResult | QueryDatasetResult,
): QueryData<TRow> => ({
  ...result,
  rows: mapRowsToObjects<TRow>(result.columns, result.rows),
  rawRows: result.rows,
});
