import { createSelector } from "@reduxjs/toolkit";

import { selectQuestionFromOptsBuilder } from "metabase/metadata-store";
import type { State } from "metabase/redux/store";
import type { DatasetQuery } from "metabase-types/api";

// Memoised on the builder, which is itself memoised on the metadata, so the
// query keeps one reference for as long as the metadata behind it does.
export const getInitialQuery = createSelector(
  [selectQuestionFromOptsBuilder],
  (buildQuestion) =>
    buildQuestion({ DEPRECATED_RAW_MBQL_type: "query" }).query(),
);

export const getQuery = createSelector(
  [
    selectQuestionFromOptsBuilder,
    (_state: State, datasetQuery: DatasetQuery) => datasetQuery,
  ],
  (buildQuestion, datasetQuery) =>
    buildQuestion({ dataset_query: datasetQuery }).query(),
);
