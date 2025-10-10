import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DraftTransformSource } from "metabase-types/api";

import { useQueryResults } from "./use-query-results";
import { useQueryState } from "./use-query-state";

interface QueryResultValue {
  result: any;
  rawSeries: any;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  runQuery: () => Promise<void>;
  cancelQuery: () => void;
}

type QueryTransformState = {
  type: "query";
  question: Question;
  proposedQuestion?: Question;
  isQueryDirty: boolean;
  setQuestion: (newQuestion: Question) => void;
  isNative: boolean;
};

export type QueryEditorValue = QueryResultValue & QueryTransformState;

// type PythonTransformState = { type: "python" };
// export type PythonEditorValue = QueryResultValue & PythonTransformState;

export type TransformEditorValue = QueryEditorValue; // | PythonEditorValue;

// TODO: rename this file to match new hook name
// TODO: this needs to handle python sources as well
// TODO: this needs to merge with useSourceState
export function useTransformEditor(
  initialSource: DraftTransformSource,
  proposedSource?: DraftTransformSource,
): TransformEditorValue {
  const queryState = useQueryState(initialSource.query, proposedSource?.query);
  const queryResults = useQueryResults(
    queryState.question,
    queryState.proposedQuestion,
  );
  const { isNative } = Lib.queryDisplayInfo(queryState.question.query());

  return {
    type: "query" as const,
    ...queryState,
    ...queryResults,
    isNative,
  };
}
