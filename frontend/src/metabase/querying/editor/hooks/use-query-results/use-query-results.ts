import { useEffect, useMemo, useRef } from "react";

import { useLazyGetAdhocQueryQuery } from "metabase/api";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { normalizeParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { Dataset, DatasetQuery, Field } from "metabase-types/api";

import type { QueryEditorUiState } from "../../types";

export function useQueryResults(
  question: Question,
  uiState: QueryEditorUiState,
  onChangeQuestion: (newQuestion: Question) => void,
  onChangeUiState: (newUiState: QueryEditorUiState) => void,
  onChangeResultMetadata?: (newResultMetadata: Field[] | null) => void,
) {
  const { lastRunQuery } = uiState;
  const [runAdhocQuery, { data = null, isFetching: isRunning = false }] =
    useLazyGetAdhocQueryQuery();
  const questionRef = useRef(question);
  questionRef.current = question;
  const abortRef = useRef<() => void>();

  const { result, rawSeries, isRunnable, isResultDirty } = useMemo(() => {
    const lastRunQuestion = lastRunQuery
      ? Question.create({
          dataset_query: lastRunQuery,
          metadata: question.metadata(),
          cardType: question.type(),
          display: question.display(),
          visualization_settings: question.settings(),
        })
      : null;
    const rawSeries =
      lastRunQuestion && data
        ? [{ card: lastRunQuestion.card(), data: data.data }]
        : null;
    const isRunnable = Lib.canRun(question.query(), question.type());
    const isResultDirty =
      lastRunQuestion == null ||
      !Lib.areLegacyQueriesEqual(
        question.datasetQuery(),
        lastRunQuestion.datasetQuery(),
      );

    return {
      result: data,
      rawSeries,
      isRunnable,
      isResultDirty,
    };
  }, [question, data, lastRunQuery]);

  const setQueryResultState = (
    result: Dataset | null,
    currentQuery: DatasetQuery,
    lastRunQuery: DatasetQuery | null,
  ) => {
    const isValid =
      result != null &&
      lastRunQuery != null &&
      Lib.areLegacyQueriesEqual(lastRunQuery, currentQuery);

    if (isValid) {
      onChangeResultMetadata?.(result.data.results_metadata.columns);
    } else {
      onChangeResultMetadata?.(null);
    }
  };

  const runQuery = async () => {
    const lastRunQuery = question.datasetQuery();
    const action = runAdhocQuery({
      ...lastRunQuery,
      parameters: normalizeParameters(question.parameters()),
    });
    abortRef.current = action.abort;
    const { data = null } = await action;
    abortRef.current = undefined;

    onChangeUiState({ ...uiState, lastRunQuery });
    setQueryResultState(data, questionRef.current.datasetQuery(), lastRunQuery);
  };

  const cancelQuery = () => {
    abortRef.current?.();
    abortRef.current = undefined;
  };

  const setQuestionWithResultMetadata = (newQuestion: Question) => {
    onChangeQuestion(newQuestion);
    setQueryResultState(
      result,
      newQuestion.datasetQuery(),
      uiState.lastRunQuery,
    );
  };

  useEffect(() => {
    return () => abortRef.current?.();
  }, []);

  return {
    result,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
    runQuery,
    cancelQuery,
    setQuestionWithResultMetadata,
  };
}
