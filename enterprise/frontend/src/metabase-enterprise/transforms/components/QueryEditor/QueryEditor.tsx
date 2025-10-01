import { useDisclosure, useHotkeys, useToggle } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import type { SelectionRange } from "metabase/query_builder/components/NativeQueryEditor/types";
import type { QueryModalType } from "metabase/query_builder/constants";
import { NativeQueryPreview } from "metabase/querying/notebook/components/NativeQueryPreview";
import { Center, Flex, Loader, Modal, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  NativeQuerySnippet,
  QueryTransformSource,
  Transform,
} from "metabase-types/api";

import { useQueryMetadata } from "../../hooks/use-query-metadata";
import { useQueryResults } from "../../hooks/use-query-results";
import { useQueryState } from "../../hooks/use-query-state";

import { EditorBody } from "./EditorBody";
import { EditorHeader } from "./EditorHeader";
import { EditorSidebar } from "./EditorSidebar";
import { EditorValidationCard } from "./EditorValidationCard";
import { EditorVisualization } from "./EditorVisualization";
import {
  NativeQuerySidebar,
  NativeQuerySidebarToggle,
} from "./NativeQuerySidebar";
import S from "./QueryEditor.module.css";
import {
  getValidationResult,
  useInsertSnippetHandler,
  useSelectedText,
} from "./utils";
import { useRegisterMetabotTransformContext } from "metabase-enterprise/transforms/hooks/use-register-transform-metabot-context";

type QueryEditorProps = {
  transform?: Transform | undefined;
  initialSource: QueryTransformSource;
  proposedSource?: QueryTransformSource;
  isNew?: boolean;
  isSaving?: boolean;
  onSave: (source: QueryTransformSource) => void;
  onChange?: (source: QueryTransformSource) => void;
  onCancel: () => void;
  onRejectProposed?: () => void;
  onAcceptProposed?: (query: QueryTransformSource) => void;
};

export function QueryEditor({
  transform,
  initialSource,
  proposedSource,
  isNew = true,
  isSaving = false,
  onSave,
  onChange,
  onCancel,
  onRejectProposed,
  onAcceptProposed,
}: QueryEditorProps) {
  const { question, proposedQuestion, isQueryDirty, setQuestion } =
    useQueryState(initialSource.query, proposedSource?.query);
  const { isInitiallyLoaded } = useQueryMetadata(question);
  const {
    result,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
    runQuery,
    cancelQuery,
  } = useQueryResults(question, proposedQuestion);
  const { isNative } = Lib.queryDisplayInfo(question.query());
  const [isShowingNativeQueryPreview, toggleNativeQueryPreview] = useToggle();
  const [isPreviewQueryModalOpen, togglePreviewQueryModal] = useToggle();
  const validationResult = getValidationResult(question.query());

  const source = useMemo(() => {
    const query = proposedSource?.query ?? question.datasetQuery();
    return { type: "query" as const, query };
  }, [proposedSource, question]);
  useRegisterMetabotTransformContext(transform, source);

  const handleChange = async (newQuestion: Question) => {
    setQuestion(newQuestion);
    onChange?.({ type: "query", query: question.datasetQuery() });
  };

  const handleSave = () => {
    onSave({ type: "query", query: question.datasetQuery() });
  };

  const handleCmdEnter = () => {
    if (isRunning) {
      cancelQuery();
    } else if (isRunnable) {
      runQuery();
    }
  };

  const [
    isDataReferenceOpen,
    { toggle: toggleDataReference, close: closeDataReference },
  ] = useDisclosure();
  const [
    isSnippetSidebarOpen,
    { toggle: toggleSnippetSidebar, close: closeSnippetSidebar },
  ] = useDisclosure();

  useHotkeys([["mod+Enter", handleCmdEnter]], []);

  const handleToggleDataReference = () => {
    closeSnippetSidebar();
    toggleDataReference();
  };

  const handleToggleSnippetSidebar = () => {
    closeDataReference();
    toggleSnippetSidebar();
  };

  const handleOpenModal = (type: QueryModalType) => {
    if (type === "preview-query") {
      togglePreviewQueryModal(true);
    }
  };

  const [selectionRange, setSelectionRange] = useState<SelectionRange[]>([]);
  const selectedText = useSelectedText(question, selectionRange);
  const handleInsertSnippet = useInsertSnippetHandler({
    question,
    selectionRange,
    onChange: handleChange,
  });

  const [modalSnippet, setModalSnippet] = useState<NativeQuerySnippet | null>(
    null,
  );

  const { data: databases, isLoading } = useListDatabasesQuery({
    include_analytics: true,
  });

  if (!isInitiallyLoaded || isLoading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  return (
    <>
      <Stack
        className={S.root}
        pos="relative"
        w="100%"
        h="100%"
        bg="bg-white"
        data-testid="transform-query-editor"
        gap={0}
      >
        <EditorHeader
          validationResult={validationResult}
          name={transform?.name}
          isNew={isNew}
          isSaving={isSaving}
          isQueryDirty={isQueryDirty}
          onSave={handleSave}
          onCancel={onCancel}
        />
        <Flex h="100%" w="100%" mih="0">
          <Stack flex="2 1 100%" pos="relative">
            <EditorBody
              question={question}
              proposedQuestion={proposedQuestion}
              isNative={isNative}
              isRunnable={isRunnable}
              isRunning={isRunning}
              isResultDirty={isResultDirty}
              isShowingDataReference={isDataReferenceOpen}
              isShowingSnippetSidebar={isSnippetSidebarOpen}
              onChange={handleChange}
              onRunQuery={runQuery}
              onCancelQuery={cancelQuery}
              onRejectProposed={onRejectProposed}
              onAcceptProposed={
                proposedSource
                  ? () => onAcceptProposed?.(proposedSource)
                  : undefined
              }
              databases={databases?.data ?? []}
              onToggleDataReference={handleToggleDataReference}
              onToggleSnippetSidebar={handleToggleSnippetSidebar}
              onOpenModal={handleOpenModal}
              modalSnippet={modalSnippet}
              onChangeModalSnippet={setModalSnippet}
              onChangeNativeEditorSelection={setSelectionRange}
              nativeEditorSelectedText={selectedText}
            />
            <EditorVisualization
              question={question}
              result={result}
              rawSeries={rawSeries}
              isNative={isNative}
              isRunnable={isRunnable}
              isRunning={isRunning}
              isResultDirty={isResultDirty}
              onRunQuery={runQuery}
              onCancelQuery={() => undefined}
            />
            {!isNative && (
              <NativeQuerySidebarToggle
                isShowingNativeQueryPreview={isShowingNativeQueryPreview}
                onToggleNativeQueryPreview={toggleNativeQueryPreview}
              />
            )}
          </Stack>

          {!isNative && isShowingNativeQueryPreview && (
            <NativeQuerySidebar
              question={question}
              onConvertToNativeClick={(newQuestion) => {
                toggleNativeQueryPreview(false);
                setQuestion(newQuestion);
              }}
            />
          )}

          <EditorSidebar
            question={question}
            isNative={isNative}
            isDataReferenceOpen={isDataReferenceOpen}
            isSnippetSidebarOpen={isSnippetSidebarOpen}
            onToggleDataReference={toggleDataReference}
            onToggleSnippetSidebar={toggleSnippetSidebar}
            onChangeModalSnippet={setModalSnippet}
            onInsertSnippet={handleInsertSnippet}
          />
        </Flex>
        <EditorValidationCard validationResult={validationResult} />
      </Stack>
      {isNative && (
        <Modal
          title={t`Query preview`}
          opened={isPreviewQueryModalOpen}
          onClose={togglePreviewQueryModal}
        >
          <NativeQueryPreview query={question.query()} />
        </Modal>
      )}
    </>
  );
}
