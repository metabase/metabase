import * as Lib from "metabase-lib";
import type { CardType } from "metabase-types/api";

import type { QueryEditorState } from "../types";
import { useQueryControls } from "../use-query-controls";
import { useQueryMetadata } from "../use-query-metadata";
import { useQueryQuestion } from "../use-query-question";
import { useQueryResults } from "../use-query-results";

type UseQueryEditorProps = {
  query: Lib.Query;
  state: QueryEditorState;
  type?: CardType;
  proposedQuery?: Lib.Query;
  onChangeQuery: (query: Lib.Query) => void;
  onChangeState: (state: QueryEditorState) => void;
};

export function useQueryEditor({
  query,
  state,
  type = "question",
  proposedQuery,
  onChangeQuery,
  onChangeState,
}: UseQueryEditorProps) {
  const { question, proposedQuestion, setQuestion } = useQueryQuestion(
    query,
    type,
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
  } = useQueryResults(question, state, onChangeState);
  const {
    selectedText,
    openModal,
    setSelectionRange,
    setModalSnippet,
    insertSnippet,
    toggleDataReference,
    toggleSnippetSidebar,
    togglePreviewQueryModal,
    toggleNativeQueryPreviewSidebar,
    convertToNative,
  } = useQueryControls(question, state, setQuestion, onChangeState);
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
    toggleDataReference,
    toggleSnippetSidebar,
    togglePreviewQueryModal,
    toggleNativeQueryPreviewSidebar,
    convertToNative,
  };
}
