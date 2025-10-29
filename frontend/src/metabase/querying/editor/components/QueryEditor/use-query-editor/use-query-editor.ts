import * as Lib from "metabase-lib";
import type { CardType } from "metabase-types/api";

import type { QueryEditorUiState } from "../types";
import { useQueryControls } from "../use-query-controls";
import { useQueryMetadata } from "../use-query-metadata";
import { useQueryQuestion } from "../use-query-question";
import { useQueryResults } from "../use-query-results";

type UseQueryEditorProps = {
  type?: CardType;
  query: Lib.Query;
  uiState: QueryEditorUiState;
  proposedQuery?: Lib.Query;
  onChangeQuery: (newQuery: Lib.Query) => void;
  onChangeUiState: (newUiState: QueryEditorUiState) => void;
};

export function useQueryEditor({
  type = "question",
  query,
  uiState,
  proposedQuery,
  onChangeQuery,
  onChangeUiState,
}: UseQueryEditorProps) {
  const { question, proposedQuestion, setQuestion } = useQueryQuestion(
    type,
    query,
    proposedQuery,
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
  } = useQueryResults(question, uiState, onChangeUiState);
  const {
    selectedText,
    openModal,
    setSelectionRange,
    setModalSnippet,
    insertSnippet,
    convertToNative,
    toggleDataReferenceSidebar,
    toggleSnippetSidebar,
    toggleNativeQuerySidebar,
    togglePreviewQueryModal,
  } = useQueryControls(question, uiState, setQuestion, onChangeUiState);
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
    setQuestion,
    runQuery,
    cancelQuery,
    openModal,
    setSelectionRange,
    setModalSnippet,
    insertSnippet,
    convertToNative,
    toggleDataReferenceSidebar,
    toggleSnippetSidebar,
    togglePreviewQueryModal,
    toggleNativeQuerySidebar,
  };
}
