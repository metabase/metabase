import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { NativeQueryPreview } from "metabase/querying/notebook/components/NativeQueryPreview";
import { Center, Flex, Modal } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { QueryTransformSource, TransformId } from "metabase-types/api";

import { TransformHeaderView } from "../TransformHeader";

import {
  NativeQueryPreviewSidebar,
  NativeQueryPreviewSidebarToggle,
} from "./NativeQueryPreviewSidebar";
import { NativeQuerySidebar } from "./NativeQuerySidebar";
import { QuerySection } from "./QuerySection";
import { SaveSection } from "./SaveSection";
import { VisualizationSection } from "./VisualizationSection";
import { useEditorControls } from "./use-editor-controls";
import { useQueryMetadata } from "./use-query-metadata";
import { useQueryResults } from "./use-query-results";
import { useSourceQuery } from "./use-source-query";

type TransformEditorProps = {
  id?: TransformId;
  name: string;
  source: QueryTransformSource;
  isSaving: boolean;
  isSourceDirty: boolean;
  onNameChange: (newName: string) => void;
  onSourceChange: (newSource: QueryTransformSource) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function TransformEditor({
  id,
  name,
  source,
  isSaving,
  isSourceDirty,
  onNameChange,
  onSourceChange,
  onSave,
  onCancel,
}: TransformEditorProps) {
  const { question, handleChangeQuestion } = useSourceQuery(
    source,
    onSourceChange,
  );
  const { isMetadataLoading, metadataError } = useQueryMetadata(question);
  const {
    result,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
    handleRunQuery,
    handleCancelQuery,
  } = useQueryResults(question);
  const {
    selectedText,
    modalSnippet,
    isDataReferenceOpen,
    isSnippetSidebarOpen,
    isPreviewQueryModalOpen,
    isNativeQueryPreviewSidebarOpen,
    handleOpenModal,
    handleChangeSelectionRange,
    handleChangeModalSnippet,
    handleInsertSnippet,
    handleToggleDataReference,
    handleToggleSnippetSidebar,
    handleTogglePreviewQueryModal,
    handleToggleNativeQueryPreviewSidebar,
    handleConvertToNative,
  } = useEditorControls(question, handleChangeQuestion);
  const {
    data: databases,
    isLoading: isDatabaseListLoading,
    error: databasesError,
  } = useListDatabasesQuery({
    include_analytics: true,
  });
  const { isNative } = Lib.queryDisplayInfo(question.query());
  const isLoading = isMetadataLoading || isDatabaseListLoading;
  const error = metadataError ?? databasesError;

  if (isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <>
      <Flex direction="column" h="100%">
        <TransformHeaderView
          id={id}
          name={name}
          actions={
            (isSaving || isSourceDirty) && (
              <SaveSection
                isSaving={isSaving}
                onSave={onSave}
                onCancel={onCancel}
              />
            )
          }
          onNameChange={onNameChange}
        />
        <Flex flex={1}>
          <Flex flex="2 1 0" direction="column" pos="relative">
            <QuerySection
              question={question}
              databases={databases?.data ?? []}
              modalSnippet={modalSnippet}
              nativeEditorSelectedText={selectedText}
              isNative={isNative}
              isRunnable={isRunnable}
              isRunning={isRunning}
              isResultDirty={isResultDirty}
              isShowingDataReference={isDataReferenceOpen}
              isShowingSnippetSidebar={isSnippetSidebarOpen}
              onChange={handleChangeQuestion}
              onRunQuery={handleRunQuery}
              onCancelQuery={handleCancelQuery}
              onToggleDataReference={handleToggleDataReference}
              onToggleSnippetSidebar={handleToggleSnippetSidebar}
              onOpenModal={handleOpenModal}
              onChangeModalSnippet={handleChangeModalSnippet}
              onChangeNativeEditorSelection={handleChangeSelectionRange}
            />
            <VisualizationSection
              question={question}
              result={result}
              rawSeries={rawSeries}
              isNative={isNative}
              isRunnable={isRunnable}
              isRunning={isRunning}
              isResultDirty={isResultDirty}
              onRunQuery={handleRunQuery}
              onCancelQuery={handleCancelQuery}
            />
            {!isNative && (
              <NativeQueryPreviewSidebarToggle
                isNativeQueryPreviewSidebarOpen={
                  isNativeQueryPreviewSidebarOpen
                }
                onToggleNativeQueryPreviewSidebar={
                  handleToggleNativeQueryPreviewSidebar
                }
              />
            )}
          </Flex>
          {isNative && (
            <NativeQuerySidebar
              question={question}
              isNative={isNative}
              isDataReferenceOpen={isDataReferenceOpen}
              isSnippetSidebarOpen={isSnippetSidebarOpen}
              onInsertSnippet={handleInsertSnippet}
              onToggleDataReference={handleToggleDataReference}
              onToggleSnippetSidebar={handleToggleSnippetSidebar}
              onChangeModalSnippet={handleChangeModalSnippet}
            />
          )}
          {!isNative && isNativeQueryPreviewSidebarOpen && (
            <NativeQueryPreviewSidebar
              question={question}
              onConvertToNativeClick={handleConvertToNative}
            />
          )}
        </Flex>
      </Flex>
      {isNative && (
        <Modal
          title={t`Query preview`}
          opened={isPreviewQueryModalOpen}
          onClose={handleTogglePreviewQueryModal}
        >
          <NativeQueryPreview query={question.query()} />
        </Modal>
      )}
    </>
  );
}
