import { useDisclosure, useHotkeys, useToggle } from "@mantine/hooks";
import { useState } from "react";
import { ResizableBox } from "react-resizable";
import { useWindowSize } from "react-use";

import { useListDatabasesQuery } from "metabase/api";
import type { SelectionRange } from "metabase/query_builder/components/NativeQueryEditor/types";
import { ControlledNotebookNativePreview } from "metabase/querying/notebook/components/NotebookNativePreview/NotebookNativePreview";
import { Box, Center, Flex, Loader, Stack, rem } from "metabase/ui";
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
import { useInsertSnippetHandler, useSelectedText } from "./util";

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
  const [isShowingNativeQueryPreview, toggleNativeQueryPreview] = useToggle();

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

  const { width: windowWidth } = useWindowSize();

  if (!isInitiallyLoaded || isLoading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  const minSidebarWidth = 428;
  const minNotebookWidth = 640;
  const maxSidebarWidth = windowWidth - minNotebookWidth;

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
        isShowingNativeQueryPreview={isShowingNativeQueryPreview}
        onToggleNativeQueryPreview={
          isNative ? undefined : toggleNativeQueryPreview
        }
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
        {isShowingNativeQueryPreview && !isNative && (
          <ResizableBox
            width={minSidebarWidth}
            minConstraints={[minSidebarWidth, 0]}
            maxConstraints={[maxSidebarWidth, 0]}
            axis="x"
            resizeHandles={["w"]}
            handle={resizeHandle}
            style={{
              borderLeft: "1px solid var(--mb-color-border)",
              marginInlineStart: "0.25rem",
            }}
          >
            <ControlledNotebookNativePreview
              question={question}
              onConvertClick={(newQuestion) => {
                toggleNativeQueryPreview();
                setQuestion(newQuestion);
              }}
            />
          </ResizableBox>
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
    </Stack>
  );
}

const resizeHandle = (
  <Flex
    data-testid="notebook-native-preview-resize-handle"
    align="center"
    justify="center"
    w="sm"
    h="100%"
    top={0}
    pos="absolute"
    left={rem(-4)}
    style={{
      cursor: "col-resize",
    }}
  >
    <Box h="6.25rem" w="xs" bg="border" />
  </Flex>
);
