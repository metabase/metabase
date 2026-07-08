import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { DatasetQuery } from "metabase-types/api";

export function getQuery(datasetQuery: DatasetQuery, metadata: Metadata) {
  return Question.create({ dataset_query: datasetQuery, metadata }).query();
}

export function getInitialQuery(metadata: Metadata) {
  return Question.create({
    DEPRECATED_RAW_MBQL_type: "query",
    metadata,
  }).query();
}
