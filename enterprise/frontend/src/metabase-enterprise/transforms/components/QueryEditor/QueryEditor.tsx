import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { useState } from "react";

import { useListDatabasesQuery } from "metabase/api";
import type { SelectionRange } from "metabase/query_builder/components/NativeQueryEditor/types";
import { Center, Flex, Loader, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetQuery, NativeQuerySnippet } from "metabase-types/api";

import { useQueryMetadata } from "../../hooks/use-query-metadata";
import { useQueryResults } from "../../hooks/use-query-results";
import { useQueryState } from "../../hooks/use-query-state";

import { EditorBody } from "./EditorBody";
import { EditorHeader } from "./EditorHeader";
import { EditorSidebar } from "./EditorSidebar";
import { EditorValidationCard } from "./EditorValidationCard";
import { EditorVisualization } from "./EditorVisualization";
import S from "./QueryEditor.module.css";
import {
  getValidationResult,
  useInsertSnippetHandler,
  useSelectedText,
} from "./util";

type QueryEditorProps = {
  initialQuery: DatasetQuery;
  isNew?: boolean;
  isSaving?: boolean;
  onSave: (newQuery: DatasetQuery) => void;
  onCancel: () => void;
};

export function QueryEditor({
  initialQuery,
  isNew = true,
  isSaving = false,
  onSave,
  onCancel,
}: QueryEditorProps) {
  const { question, isQueryDirty, setQuestion } = useQueryState(initialQuery);
  const { isInitiallyLoaded } = useQueryMetadata(question);
  const {
    result,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
    runQuery,
    cancelQuery,
  } = useQueryResults(question);
  const { isNative } = Lib.queryDisplayInfo(question.query());
  const validationResult = getValidationResult(question.query());

  const handleChange = async (newQuestion: Question) => {
    setQuestion(newQuestion);
  };

  const handleSave = () => {
    onSave(question.datasetQuery());
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
        isNew={isNew}
        isSaving={isSaving}
        isQueryDirty={isQueryDirty}
        onSave={handleSave}
        onCancel={onCancel}
      />
      <Flex h="100%" w="100%">
        <Stack flex="2 1 100%">
          <EditorBody
            question={question}
            isNative={isNative}
            isRunnable={isRunnable}
            isRunning={isRunning}
            isResultDirty={isResultDirty}
            isShowingDataReference={isDataReferenceOpen}
            isShowingSnippetSidebar={isSnippetSidebarOpen}
            onChange={handleChange}
            onRunQuery={runQuery}
            onCancelQuery={cancelQuery}
            databases={databases?.data ?? []}
            onToggleDataReference={handleToggleDataReference}
            onToggleSnippetSidebar={handleToggleSnippetSidebar}
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
        </Stack>
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
  );
}
