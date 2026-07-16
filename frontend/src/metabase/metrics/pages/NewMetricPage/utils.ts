import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";
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

export function ensureDefaultDimension(query: Lib.Query): Lib.Query {
  if (Lib.breakouts(query, -1).length > 0) {
    return query;
  }

  const dimension = LibMetric.pickDefaultDimension(
    Lib.breakoutableColumns(query, -1),
  );
  return dimension ? Lib.breakout(query, -1, dimension) : query;
}
