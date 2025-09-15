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
import { EditorVisualization } from "./EditorVisualization";
import S from "./QueryEditor.module.css";
import { locationToPosition } from "./util";

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
  const canSave = Lib.canSave(question.query(), question.type());
  const { isNative } = Lib.queryDisplayInfo(question.query());

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

  const [selectionRange, setSelectionRange] = useState<SelectionRange[]>([
    { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
  ]);

  const handleInsertSnippet = (snippet: NativeQuerySnippet) => {
    const query = question.query();
    const text = Lib.rawNativeQuery(query);

    const range = selectionRange[0];
    if (!range) {
      return;
    }

    const { start, end } = range;

    const selectionStart = locationToPosition(text, start);
    const selectionEnd = locationToPosition(text, end);

    const newText =
      text.slice(0, selectionStart) +
      `{{snippet: ${snippet.name}}}` +
      text.slice(selectionEnd);

    const newQuery = Lib.withNativeQuery(query, newText);
    handleChange(question.setQuery(newQuery));
  };

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
      w="100%"
      h="100%"
      bg="bg-white"
      data-testid="transform-query-editor"
      gap={0}
    >
      <EditorHeader
        isNew={isNew}
        isSaving={isSaving}
        canSave={canSave && (isNew || isQueryDirty)}
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
    </Stack>
  );
}
