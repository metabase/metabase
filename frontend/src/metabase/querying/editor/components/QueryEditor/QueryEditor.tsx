import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { NativeQueryPreview } from "metabase/querying/notebook/components/NativeQueryPreview";
import { Center, Flex, Modal } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { useQueryEditor } from "../../hooks/use-query-editor";
import type { QueryEditorUiOptions, QueryEditorUiState } from "../../types";

import {
  NativeQueryPreviewSidebar,
  NativeQueryPreviewSidebarToggle,
} from "./NativeQueryPreviewSidebar";
import { NativeQuerySidebar } from "./NativeQuerySidebar";
import { QuerySection } from "./QuerySection";
import { VisualizationSection } from "./VisualizationSection";

type QueryEditorProps = {
  query: Lib.Query;
  uiState: QueryEditorUiState;
  uiOptions?: QueryEditorUiOptions;
  proposedQuery?: Lib.Query;
  onChangeQuery: (newQuery: Lib.Query) => void;
  onChangeUiState: (newUiState: QueryEditorUiState) => void;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
};

export function QueryEditor({
  query,
  uiState,
  uiOptions,
  proposedQuery,
  onChangeQuery,
  onChangeUiState,
  onAcceptProposed,
  onRejectProposed,
}: QueryEditorProps) {
  const {
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
    openSnippetModalWithSelectedText,
    insertSnippet,
    convertToNative,
    toggleDataReferenceSidebar,
    toggleSnippetSidebar,
    toggleNativeQuerySidebar,
    togglePreviewQueryModal,
  } = useQueryEditor({
    query,
    uiState,
    proposedQuery,
    onChangeQuery,
    onChangeUiState,
  });

  if (isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <>
      <Flex flex={1} h="100%">
        <Flex flex="2 1 0" direction="column" pos="relative">
          <QuerySection
            question={question}
            proposedQuestion={proposedQuestion}
            modalSnippet={uiState.modalSnippet}
            nativeEditorSelectedText={selectedText}
            isNative={isNative}
            isRunnable={isRunnable}
            isRunning={isRunning}
            isResultDirty={isResultDirty}
            isShowingDataReference={uiState.sidebarType === "data-reference"}
            isShowingSnippetSidebar={uiState.sidebarType === "snippet"}
            shouldDisableItem={uiOptions?.shouldDisableDataPickerItem}
            shouldDisableDatabase={uiOptions?.shouldDisableDatabasePickerItem}
            onChange={setQuestion}
            onRunQuery={runQuery}
            onCancelQuery={cancelQuery}
            onToggleDataReference={toggleDataReferenceSidebar}
            onToggleSnippetSidebar={toggleSnippetSidebar}
            onOpenModal={openModal}
            onChangeModalSnippet={setModalSnippet}
            onInsertSnippet={insertSnippet}
            onChangeNativeEditorSelection={setSelectionRange}
            onAcceptProposed={onAcceptProposed}
            onRejectProposed={onRejectProposed}
          />
          <VisualizationSection
            question={question}
            result={result}
            rawSeries={rawSeries}
            isNative={isNative}
            isRunnable={isRunnable}
            isRunning={isRunning}
            isResultDirty={isResultDirty}
            onRunQuery={runQuery}
            onCancelQuery={cancelQuery}
          />
          {!isNative && (
            <NativeQueryPreviewSidebarToggle
              isNativeQueryPreviewSidebarOpen={
                uiState.sidebarType === "native-query"
              }
              onToggleNativeQueryPreviewSidebar={toggleNativeQuerySidebar}
            />
          )}
        </Flex>
        {isNative && (
          <NativeQuerySidebar
            question={question}
            isNative={isNative}
            isDataReferenceOpen={uiState.sidebarType === "data-reference"}
            isSnippetSidebarOpen={uiState.sidebarType === "snippet"}
            onInsertSnippet={insertSnippet}
            onToggleDataReference={toggleDataReferenceSidebar}
            onToggleSnippetSidebar={toggleSnippetSidebar}
            onChangeModalSnippet={setModalSnippet}
            onOpenSnippetModalWithSelectedText={
              openSnippetModalWithSelectedText
            }
          />
        )}
        {!isNative && uiState.sidebarType === "native-query" && (
          <NativeQueryPreviewSidebar
            question={question}
            convertToNativeTitle={uiOptions?.convertToNativeTitle}
            convertToNativeButtonLabel={uiOptions?.convertToNativeButtonLabel}
            onConvertToNativeClick={convertToNative}
          />
        )}
      </Flex>
      {isNative && (
        <Modal
          title={t`Query preview`}
          opened={uiState.modalType === "preview-query"}
          onClose={togglePreviewQueryModal}
        >
          <NativeQueryPreview query={query} />
        </Modal>
      )}
    </>
  );
}
