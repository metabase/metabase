import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import type { DataPickerItem } from "metabase/common/components/Pickers/DataPicker";
import { NativeQueryPreview } from "metabase/querying/notebook/components/NativeQueryPreview";
import { Center, Flex, Modal } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Database from "metabase-lib/v1/metadata/Database";
import type { CardType, RecentCollectionItem } from "metabase-types/api";

import {
  NativeQueryPreviewSidebar,
  NativeQueryPreviewSidebarToggle,
} from "./NativeQueryPreviewSidebar";
import { NativeQuerySidebar } from "./NativeQuerySidebar";
import { QuerySection } from "./QuerySection";
import { VisualizationSection } from "./VisualizationSection";
import type { QueryEditorUiControls } from "./types";
import { useEditorUiControls } from "./use-editor-ui-controls";
import { useQueryMetadata } from "./use-query-metadata";
import { useQueryResults } from "./use-query-results";
import { useQuestionQuery } from "./use-question-query";

type QueryEditorProps = {
  query: Lib.Query;
  proposedQuery?: Lib.Query;
  type: CardType;
  uiControls: QueryEditorUiControls;
  convertToNativeTitle?: string;
  convertToNativeButtonLabel?: string;
  shouldDisableDatabase?: (database: Database) => boolean;
  shouldDisableItem?: (
    item: DataPickerItem | CollectionPickerItem | RecentCollectionItem,
  ) => boolean;
  onQueryChange: (newQuery: Lib.Query) => void;
  onUiControlsChange: (newUiControls: QueryEditorUiControls) => void;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
};

export function QueryEditor({
  query,
  proposedQuery,
  type,
  uiControls,
  convertToNativeTitle,
  convertToNativeButtonLabel,
  shouldDisableDatabase,
  shouldDisableItem,
  onQueryChange,
  onUiControlsChange,
  onAcceptProposed,
  onRejectProposed,
}: QueryEditorProps) {
  const { question, proposedQuestion, setQuestion } = useQuestionQuery(
    query,
    proposedQuery,
    type,
    onQueryChange,
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
  } = useQueryResults(question);
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
  } = useEditorUiControls(
    question,
    uiControls,
    setQuestion,
    onUiControlsChange,
  );
  const { isNative } = Lib.queryDisplayInfo(question.query());

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
            modalSnippet={uiControls.modalSnippet}
            nativeEditorSelectedText={selectedText}
            isNative={isNative}
            isRunnable={isRunnable}
            isRunning={isRunning}
            isResultDirty={isResultDirty}
            isShowingDataReference={uiControls.isDataReferenceOpen}
            isShowingSnippetSidebar={uiControls.isSnippetSidebarOpen}
            shouldDisableDatabase={shouldDisableDatabase}
            shouldDisableItem={shouldDisableItem}
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
                uiControls.isNativeQueryPreviewSidebarOpen
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
            isDataReferenceOpen={uiControls.isDataReferenceOpen}
            isSnippetSidebarOpen={uiControls.isSnippetSidebarOpen}
            onInsertSnippet={insertSnippet}
            onToggleDataReference={toggleDataReference}
            onToggleSnippetSidebar={toggleSnippetSidebar}
            onChangeModalSnippet={setModalSnippet}
          />
        )}
        {!isNative && uiControls.isNativeQueryPreviewSidebarOpen && (
          <NativeQueryPreviewSidebar
            question={question}
            convertToNativeTitle={convertToNativeTitle}
            convertToNativeButtonLabel={convertToNativeButtonLabel}
            onConvertToNativeClick={convertToNative}
          />
        )}
      </Flex>
      {isNative && (
        <Modal
          title={t`Query preview`}
          opened={uiControls.isPreviewQueryModalOpen}
          onClose={togglePreviewQueryModal}
        >
          <NativeQueryPreview query={question.query()} />
        </Modal>
      )}
    </>
  );
}
