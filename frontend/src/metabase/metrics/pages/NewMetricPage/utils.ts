import type { DraftQuestionBuilder } from "metabase/metadata-store";
import type { DatasetQuery } from "metabase-types/api";

export function getQuery(
  datasetQuery: DatasetQuery,
  buildQuestion: DraftQuestionBuilder,
) {
  return buildQuestion({ dataset_query: datasetQuery }).query();
}

export function getInitialQuery(buildQuestion: DraftQuestionBuilder) {
  return buildQuestion({ DEPRECATED_RAW_MBQL_type: "query" }).query();
}
