import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

import { useQueryResults } from "./use-query-results";
import { useQueryState } from "./use-query-state";

interface QueryResultValue {
  result: any;
  rawSeries: any;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  isNative: boolean;
  runQuery: () => Promise<void>;
  cancelQuery: () => void;
}

type QueryTransformState = {
  // TODO: add `type` for discrim union to handle python transforms
  question: Question;
  proposedQuestion?: Question;
  isQueryDirty: boolean;
  setQuestion: (newQuestion: Question) => void;
};

export type TransformEditorValue = QueryResultValue & QueryTransformState;

// TODO: this needs to handle python sources as well
export function useQueryEditor(
  initialQuery: DatasetQuery,
  proposedQuery?: DatasetQuery,
): TransformEditorValue {
  const queryState = useQueryState(initialQuery, proposedQuery);
  const queryResults = useQueryResults(
    queryState.question,
    queryState.proposedQuestion,
  );
  const { isNative } = Lib.queryDisplayInfo(queryState.question.query());

  return {
    // Query state
    question: queryState.question,
    proposedQuestion: queryState.proposedQuestion,
    isQueryDirty: queryState.isQueryDirty,
    setQuestion: queryState.setQuestion,

    // Query results
    result: queryResults.result,
    rawSeries: queryResults.rawSeries,
    isRunnable: queryResults.isRunnable,
    isRunning: queryResults.isRunning,
    isResultDirty: queryResults.isResultDirty,
    isNative,
    runQuery: queryResults.runQuery,
    cancelQuery: queryResults.cancelQuery,
  };
}
