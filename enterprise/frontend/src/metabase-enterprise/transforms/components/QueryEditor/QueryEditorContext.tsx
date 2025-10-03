import { type ReactNode, createContext, useContext } from "react";

import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

import { useQueryResults } from "../../hooks/use-query-results";
import { useQueryState } from "../../hooks/use-query-state";

export interface QueryEditorContextValue {
  // Query state
  question: Question;
  proposedQuestion?: Question;
  isQueryDirty: boolean;
  setQuestion: (newQuestion: Question) => void;

  // Query results
  result: any;
  rawSeries: any;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  isNative: boolean;
  runQuery: () => Promise<void>;
  cancelQuery: () => void;
}

export const QueryEditorContext = createContext<QueryEditorContextValue | undefined>(undefined);

export interface QueryEditorProviderProps {
  children: ReactNode;
  initialQuery: DatasetQuery;
  proposedQuery?: DatasetQuery;
}

export function QueryEditorProvider({
  children,
  initialQuery,
  proposedQuery,
}: QueryEditorProviderProps) {
  const queryState = useQueryState(initialQuery, proposedQuery);
  const queryResults = useQueryResults(queryState.question, queryState.proposedQuestion);
  const { isNative } = Lib.queryDisplayInfo(queryState.question.query());

  const value: QueryEditorContextValue = {
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

  return (
    <QueryEditorContext.Provider value={value}>
      {children}
    </QueryEditorContext.Provider>
  );
}

export const useQueryEditorContext = (): QueryEditorContextValue => {
  const context = useContext(QueryEditorContext);
  if (!context) {
    throw new Error("useQueryEditorContext must be used within a QueryEditorProvider");
  }
  return context;
};
