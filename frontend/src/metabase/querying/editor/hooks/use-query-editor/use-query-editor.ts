import * as Lib from "metabase-lib";
import type { Field } from "metabase-types/api";

import type { QueryEditorUiOptions, QueryEditorUiState } from "../../types";
import { useQueryControls } from "../use-query-controls";
import { useQueryMetadata } from "../use-query-metadata";
import { useQueryQuestion } from "../use-query-question";
import { useQueryResults } from "../use-query-results";

type UseQueryEditorProps = {
  query: Lib.Query;
  uiState: QueryEditorUiState;
  uiOptions?: QueryEditorUiOptions;
  proposedQuery?: Lib.Query;
  onChangeQuery: (newQuery: Lib.Query) => void;
  onChangeUiState: (newUiState: QueryEditorUiState) => void;
  onChangeResultMetadata?: (newResultMetadata: Field[] | null) => void;
};

export function useQueryEditor({
  query,
  uiState,
  uiOptions,
  proposedQuery,
  onChangeQuery,
  onChangeUiState,
  onChangeResultMetadata,
}: UseQueryEditorProps) {
  const { question, proposedQuestion, setQuestion } = useQueryQuestion(
    query,
    proposedQuery,
    uiOptions,
    onChangeQuery,
  );
  const { isLoading, error } = useQueryMetadata(question);
  const {
    result,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
    runQuery,
    cancelQuery,
    setQuestionWithResultMetadata,
  } = useQueryResults(
    question,
    uiState,
    setQuestion,
    onChangeUiState,
    onChangeResultMetadata,
  );
  const {
    selectedText,
    openModal,
    setSelectionRange,
    setModalSnippet,
    openSnippetModalWithSelectedText,
    insertSnippet,
    convertToNative,
    toggleDataReferenceSidebar,
    toggleSnippetSidebar,
    toggleNativeQuerySidebar,
    togglePreviewQueryModal,
  } = useQueryControls(
    question,
    uiState,
    setQuestionWithResultMetadata,
    onChangeUiState,
  );
  const { isNative } = Lib.queryDisplayInfo(question.query());

  return {
    question,
    proposedQuestion,
    error,
    result,
    rawSeries,
    selectedText,
    isLoading,
    isNative,
    isRunnable,
    isRunning,
    isResultDirty,
    setQuestion: setQuestionWithResultMetadata,
    runQuery,
    cancelQuery,
    openModal,
    setSelectionRange,
    setModalSnippet,
    openSnippetModalWithSelectedText,
    insertSnippet,
    convertToNative,
    toggleDataReferenceSidebar,
    toggleSnippetSidebar,
    togglePreviewQueryModal,
    toggleNativeQuerySidebar,
  };
}
