import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { NativeQueryPreview } from "metabase/querying/notebook/components/NativeQueryPreview";
import { Center, Flex, Modal } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { CardType } from "metabase-types/api";

import {
  NativeQueryPreviewSidebar,
  NativeQueryPreviewSidebarToggle,
} from "./NativeQueryPreviewSidebar";
import { NativeQuerySidebar } from "./NativeQuerySidebar";
import { QuerySection } from "./QuerySection";
import { VisualizationSection } from "./VisualizationSection";
import type { QueryEditorState } from "./types";
import { useQueryEditor } from "./use-query-editor";

type QueryEditorProps = {
  query: Lib.Query;
  state: QueryEditorState;
  type?: CardType;
  proposedQuery?: Lib.Query;
  onChangeQuery: (newQuery: Lib.Query) => void;
  onChangeState: (newUiControls: QueryEditorState) => void;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
};

export function QueryEditor({
  query,
  state,
  type,
  proposedQuery,
  onChangeQuery,
  onChangeState,
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
    insertSnippet,
    toggleDataReference,
    toggleSnippetSidebar,
    togglePreviewQueryModal,
    toggleNativeQueryPreviewSidebar,
    convertToNative,
  } = useQueryEditor({
    query,
    state,
    type,
    proposedQuery,
    onChangeQuery,
    onChangeState,
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
            modalSnippet={state.modalSnippet}
            nativeEditorSelectedText={selectedText}
            isNative={isNative}
            isRunnable={isRunnable}
            isRunning={isRunning}
            isResultDirty={isResultDirty}
            isShowingDataReference={state.isDataReferenceOpen}
            isShowingSnippetSidebar={state.isSnippetSidebarOpen}
            // shouldDisableDatabase={shouldDisableDatabase}
            // shouldDisableItem={shouldDisableItem}
            onChange={setQuestion}
            onRunQuery={runQuery}
            onCancelQuery={cancelQuery}
            onToggleDataReference={toggleDataReference}
            onToggleSnippetSidebar={toggleSnippetSidebar}
            onOpenModal={openModal}
            onChangeModalSnippet={setModalSnippet}
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
                state.isNativeQueryPreviewSidebarOpen
              }
              onToggleNativeQueryPreviewSidebar={
                toggleNativeQueryPreviewSidebar
              }
            />
          )}
        </Flex>
        {isNative && (
          <NativeQuerySidebar
            question={question}
            isNative={isNative}
            isDataReferenceOpen={state.isDataReferenceOpen}
            isSnippetSidebarOpen={state.isSnippetSidebarOpen}
            onInsertSnippet={insertSnippet}
            onToggleDataReference={toggleDataReference}
            onToggleSnippetSidebar={toggleSnippetSidebar}
            onChangeModalSnippet={setModalSnippet}
          />
        )}
        {!isNative && state.isNativeQueryPreviewSidebarOpen && (
          <NativeQueryPreviewSidebar
            question={question}
            // convertToNativeTitle={convertToNativeTitle}
            // convertToNativeButtonLabel={convertToNativeButtonLabel}
            onConvertToNativeClick={convertToNative}
          />
        )}
      </Flex>
      {isNative && (
        <Modal
          title={t`Query preview`}
          opened={state.isPreviewQueryModalOpen}
          onClose={togglePreviewQueryModal}
        >
          <NativeQueryPreview query={question.query()} />
        </Modal>
      )}
    </>
  );
}
