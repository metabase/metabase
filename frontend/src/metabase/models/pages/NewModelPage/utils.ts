import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { DatasetQuery } from "metabase-types/api";

import type { NewModelValues } from "./types";

export function getQuery(datasetQuery: DatasetQuery, metadata: Metadata) {
  return Question.create({ dataset_query: datasetQuery, metadata }).query();
}

export function getInitialQuery(metadata: Metadata) {
  return Question.create({
    DEPRECATED_RAW_MBQL_type: "query",
    metadata,
  }).query();
}

export function getInitialNativeQuery(metadata: Metadata) {
  return Question.create({
    DEPRECATED_RAW_MBQL_type: "native",
    metadata,
  }).query();
}

export function getDefaultValues(name: string): Partial<NewModelValues> {
  return { name };
}
