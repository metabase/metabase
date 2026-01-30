import cx from "classnames";
import { type ReactNode, useMemo, useState } from "react";
import { ResizableBox } from "react-resizable";
import { useWindowSize } from "react-use";

import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import type { DataPickerItem } from "metabase/common/components/Pickers/DataPicker";
import { ResizeHandle } from "metabase/common/components/ResizeHandle";
import { useSetting } from "metabase/common/hooks";
import {
  NativeQueryEditor,
  type SelectionRange,
} from "metabase/query_builder/components/NativeQueryEditor";
import type { QueryModalType } from "metabase/query_builder/constants";
import type { QueryEditorDatabasePickerItem } from "metabase/querying/editor/types";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  NativeQuerySnippet,
  RecentCollectionItem,
} from "metabase-types/api";

import S from "./QueryEditorBody.module.css";

const DEFAULT_EDITOR_HEIGHT = 550;
const NATIVE_HEADER_HEIGHT = 55;
const HEADER_HEIGHT = 65 + 50;
const PREVIEW_MAX_INITIAL_HEIGHT = 192;

const NATIVE_EDITOR_SIDEBAR_FEATURES = {
  dataReference: true,
  snippets: true,
  formatQuery: true,
  variables: false,
  promptInput: false,
};

type QueryEditorBodyProps = {
  extraButton?: ReactNode;
  question: Question;
  proposedQuestion: Question | undefined;
  modalSnippet?:
    | NativeQuerySnippet
    | Partial<Omit<NativeQuerySnippet, "id">>
    | null;
  nativeEditorSelectedText?: string | null;
  readOnly?: boolean;
  resizable?: boolean;
  canChangeDatabase?: boolean;
  isNative: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  isShowingDataReference: boolean;
  isShowingSnippetSidebar: boolean;
  shouldDisableDatabase?: (database: QueryEditorDatabasePickerItem) => boolean;
  shouldDisableItem?: (
    item: DataPickerItem | CollectionPickerItem | RecentCollectionItem,
  ) => boolean;
  shouldShowLibrary?: boolean;
  onBlur?: () => void;
  onChange: (newQuestion: Question) => void;
  onRunQuery: () => Promise<void>;
  onToggleDataReference: () => void;
  onToggleSnippetSidebar: () => void;
  onCancelQuery: () => void;
  onInsertSnippet: (snippet: NativeQuerySnippet) => void;
  onChangeModalSnippet: (snippet: NativeQuerySnippet | null) => void;
  onChangeNativeEditorSelection: (range: SelectionRange[]) => void;
  onOpenModal: (type: QueryModalType) => void;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
  editorHeight?: number;
  hideRunButton?: boolean;
  topBarInnerContent?: ReactNode;
  availableHeight?: number;
};

export function QueryEditorBody({
  extraButton,
  question,
  proposedQuestion,
  modalSnippet,
  nativeEditorSelectedText,
  readOnly,
  resizable,
  canChangeDatabase,
  isNative,
  isRunnable,
  isRunning,
  isResultDirty,
  isShowingDataReference,
  isShowingSnippetSidebar,
  shouldDisableDatabase,
  shouldDisableItem,
  shouldShowLibrary,
  onBlur,
  onChange,
  onRunQuery,
  onToggleDataReference,
  onToggleSnippetSidebar,
  onCancelQuery,
  onInsertSnippet,
  onChangeModalSnippet,
  onChangeNativeEditorSelection,
  onOpenModal,
  onAcceptProposed,
  onRejectProposed,
  editorHeight: editorHeightOverride,
  hideRunButton,
  topBarInnerContent,
  availableHeight,
}: QueryEditorBodyProps) {
  const [isResizing, setIsResizing] = useState(false);
  const reportTimezone = useSetting("report-timezone-long");
  const editorHeight = useInitialEditorHeight(
    isNative,
    readOnly,
    editorHeightOverride,
  );

  const dataPickerOptions = useMemo(
    () => ({ shouldDisableItem, shouldDisableDatabase, shouldShowLibrary }),
    [shouldDisableItem, shouldDisableDatabase, shouldShowLibrary],
  );

  const setQuestion = (newQuestion: Question) => {
    onChange(newQuestion);
    return Promise.resolve();
  };

  const handleNativeQueryChange = (newNativeQuery: NativeQuery) => {
    onChange(newNativeQuery.question());
  };

  if (isNative) {
    const query = question.legacyNativeQuery();
    if (!query) {
      return null;
    }

    return (
      <NativeQueryEditor
        className={cx(S.nativeQueryEditor, {
          [S.readOnly]: readOnly,
        })}
        availableHeight={availableHeight}
        question={question}
        proposedQuestion={proposedQuestion}
        query={query}
        placeholder="SELECT * FROM TABLE_NAME"
        hasTopBar
        hasRunButton={!readOnly && !hideRunButton}
        isInitiallyOpen
        isNativeEditorOpen
        readOnly={readOnly}
        resizable={resizable}
        canChangeDatabase={canChangeDatabase}
        hasParametersList={false}
        isRunnable={isRunnable}
        isRunning={isRunning}
        isResultDirty={isResultDirty}
        isShowingDataReference={isShowingDataReference}
        isShowingSnippetSidebar={isShowingSnippetSidebar}
        runQuery={hideRunButton ? undefined : onRunQuery}
        cancelQuery={onCancelQuery}
        databaseIsDisabled={shouldDisableDatabase}
        setDatasetQuery={handleNativeQueryChange}
        sidebarFeatures={NATIVE_EDITOR_SIDEBAR_FEATURES}
        toggleDataReference={onToggleDataReference}
        toggleSnippetSidebar={onToggleSnippetSidebar}
        modalSnippet={modalSnippet}
        insertSnippet={onInsertSnippet}
        closeSnippetModal={() => onChangeModalSnippet(null)}
        setNativeEditorSelectedRange={onChangeNativeEditorSelection}
        nativeEditorSelectedText={nativeEditorSelectedText}
        onBlur={onBlur}
        onOpenModal={onOpenModal}
        onAcceptProposed={onAcceptProposed}
        onRejectProposed={onRejectProposed}
        topBarInnerContent={topBarInnerContent}
        extraButton={extraButton}
      />
    );
  }

  return (
    <ResizableBox
      axis="y"
      className={S.queryResizableBox}
      height={editorHeight}
      handle={<ResizeHandle />}
      resizeHandles={readOnly ? [] : ["s"]}
      onResizeStart={() => setIsResizing(true)}
      onResizeStop={() => setIsResizing(false)}
    >
      <Box w="100%" style={{ overflow: isResizing ? "hidden" : "auto" }}>
        <Notebook
          question={question}
          readOnly={readOnly}
          isDirty={false}
          isRunnable={false}
          isResultDirty={false}
          reportTimezone={reportTimezone}
          hasVisualizeButton={false}
          updateQuestion={setQuestion}
          runQuestionQuery={onRunQuery}
          dataPickerOptions={dataPickerOptions}
        />
      </Box>
    </ResizableBox>
  );
}

function getHeaderHeight(isNative: boolean) {
  if (isNative) {
    return HEADER_HEIGHT + NATIVE_HEADER_HEIGHT;
  }
  return HEADER_HEIGHT;
}

function useInitialEditorHeight(
  isNative: boolean,
  readOnly?: boolean,
  editorHeightOverride?: number,
) {
  const { height: windowHeight } = useWindowSize();
  const headerHeight = getHeaderHeight(isNative);
  const availableHeight = windowHeight - headerHeight;

  if (editorHeightOverride) {
    return editorHeightOverride;
  }

  if (readOnly) {
    // When read-only, we don't need to split the container to show the query visualization on the bottom
    return availableHeight;
  }

  // Let's make the preview initial height be half of the available height at most
  const previewInitialHeight = Math.min(
    availableHeight / 2,
    PREVIEW_MAX_INITIAL_HEIGHT,
  );

  return Math.min(
    availableHeight - previewInitialHeight,
    DEFAULT_EDITOR_HEIGHT,
  );
}
