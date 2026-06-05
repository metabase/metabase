import { useElementSize } from "@mantine/hooks";
import cx from "classnames";
import {
  Children,
  type ReactNode,
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { useListCollectionsQuery, useListSnippetsQuery } from "metabase/api";
import { getMetabotVisible } from "metabase/metabot/state";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import {
  CodeMirrorEditor,
  type CodeMirrorEditorProps,
  type CodeMirrorEditorRef,
} from "metabase/querying/components/CodeMirrorEditor";
import { SnippetFormModal } from "metabase/querying/components/NativeQueryEditor/SnippetFormModal";
import { useNotebookScreenSize } from "metabase/querying/components/NativeQueryEditor/use-notebook-screen-size";
import type { QueryModalType } from "metabase/querying/constants";
import type { SelectionRange } from "metabase/querying/editor/types";
import { useSelector } from "metabase/redux";
import { Button, Flex, Icon, Stack, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  CardId,
  DatabaseId,
  DatasetQuery,
  NativeQuerySnippet,
  ParameterId,
} from "metabase-types/api";

import S from "./NativeQueryEditor.module.css";
import { ResizableArea } from "./ResizableArea";
import { RightClickPopover } from "./RightClickPopover";
import {
  MIN_EDITOR_HEIGHT_AFTER_DRAGGING,
  RESIZE_CONSTRAINT_OFFSET,
  THRESHOLD_FOR_AUTO_CLOSE,
} from "./constants";
import {
  NativeQueryEditorContextProvider,
  type NativeQueryEditorContextValue,
} from "./context/NativeQueryEditorContext";
import { TopBar } from "./slots/TopBar";
import {
  canFormatForEngine,
  formatQuery,
  getInitialEditorHeight,
} from "./utils";

/**
 * Props shared by the composable {@link NativeQueryEditorRoot} and the
 * backward-compatible {@link NativeQueryEditor} shim — everything except the
 * legacy layout flags (`hasTopBar`, `hasEditingSidebar`, `hasParametersList`,
 * `hasRunButton`, `sidebarFeatures`, `extraButton`, `topBarInnerContent`).
 */
export type NativeQueryEditorCoreProps = Omit<
  CodeMirrorEditorProps,
  "query"
> & {
  availableHeight?: number;
  canChangeDatabase?: boolean;
  cancelQuery?: () => void;
  className?: string;
  closeSnippetModal?: () => void;
  databaseIsDisabled?: (database: Database) => boolean;
  databaseDisabledTooltip?: (database: Database) => string | undefined;
  editorContext?: "question" | "action";
  handleResize?: () => void;
  highlightedLineNumbers?: number[];
  insertSnippet?: (snippet: NativeQuerySnippet) => void;
  isInitiallyOpen?: boolean;
  isNativeEditorOpen: boolean;
  isResultDirty?: boolean;
  isRunnable?: boolean;
  isRunning?: boolean;
  isShowingDataReference?: boolean;
  isShowingSnippetSidebar?: boolean;
  isShowingTemplateTagsEditor?: boolean;
  modalSnippet?:
    | NativeQuerySnippet
    | Partial<Omit<NativeQuerySnippet, "id">>
    | null;
  nativeEditorSelectedText?: string | null;
  onAcceptProposed?: (query: DatasetQuery) => void;
  onBlur?: () => void;
  onOpenModal?: (modalType: QueryModalType) => void;
  onRejectProposed?: () => void;
  onSetDatabaseId?: (id: DatabaseId) => void;
  openDataReferenceAtQuestion?: (id: CardId) => void;
  openSnippetModalWithSelectedText?: () => void;
  placeholder?: string;
  proposedQuestion?: Question | undefined;
  query: NativeQuery;
  question: Question;
  readOnly?: boolean;
  resizable?: boolean;
  runQuery?: () => void;
  setDatasetQuery: (query: NativeQuery) => void;
  setIsNativeEditorOpen?: (
    isOpen: boolean,
    shouldOpenDataReference?: boolean,
  ) => void;
  setNativeEditorSelectedRange?: (range: SelectionRange[]) => void;
  setParameterValue?: (parameterId: ParameterId, value: string) => void;
  toggleDataReference?: () => void;
  toggleSnippetSidebar?: () => void;
  toggleTemplateTagsEditor?: () => void;
};

type NativeQueryEditorRootProps = NativeQueryEditorCoreProps & {
  children?: ReactNode;
};

export const NativeQueryEditorRoot = forwardRef<
  HTMLDivElement,
  NativeQueryEditorRootProps
>(function NativeQueryEditorRootInner(props, ref) {
  const {
    children,
    availableHeight = Infinity,
    canChangeDatabase = true,
    cancelQuery,
    className,
    closeSnippetModal,
    databaseIsDisabled,
    databaseDisabledTooltip,
    editorContext = "question",
    extensions,
    handleResize: handleResizeFromProps,
    highlightedLineNumbers,
    insertSnippet,
    isNativeEditorOpen,
    isInitiallyOpen,
    isResultDirty = false,
    isRunnable = false,
    isRunning = false,
    isShowingDataReference = false,
    isShowingSnippetSidebar = false,
    isShowingTemplateTagsEditor = false,
    modalSnippet,
    nativeEditorSelectedText,
    onAcceptProposed,
    onBlur,
    onOpenModal,
    onRejectProposed,
    onSetDatabaseId,
    openDataReferenceAtQuestion,
    openSnippetModalWithSelectedText,
    placeholder,
    proposedQuestion,
    query,
    question,
    readOnly,
    resizable = true,
    runQuery,
    setDatasetQuery,
    setIsNativeEditorOpen,
    setNativeEditorSelectedRange,
    setParameterValue,
    toggleDataReference,
    toggleSnippetSidebar,
    toggleTemplateTagsEditor,
  } = props;

  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const { data: snippets = [] } = useListSnippetsQuery();
  const { data: snippetCollections = [] } = useListCollectionsQuery({
    namespace: "snippets",
  });

  const editorRef = useRef<CodeMirrorEditorRef>(null);
  const { ref: topBarRef, height: topBarHeight } = useElementSize();

  const canSaveSnippets =
    !isRemoteSyncReadOnly &&
    snippetCollections.some((collection) => collection.can_write);

  const canToggleEditor = typeof setIsNativeEditorOpen === "function";
  const shouldShowEditor = isNativeEditorOpen || !canToggleEditor;

  const [isSelectedTextPopoverOpen, setSelectedTextPopoverOpen] =
    useState(false);

  // do not show reference sidebar on small screens automatically
  const screenSize = useNotebookScreenSize();
  const isMetabotSidebarOpen = useSelector((state) =>
    getMetabotVisible(state, "omnibot"),
  );
  const shouldOpenDataReference =
    screenSize !== "small" && !isMetabotSidebarOpen;

  useMount(() => {
    setIsNativeEditorOpen?.(
      typeof isInitiallyOpen !== "undefined"
        ? isInitiallyOpen
        : question?.isSaved(),
      shouldOpenDataReference,
    );
  });

  useEffect(() => {
    // Close selected text popover if text is deselected
    if (isSelectedTextPopoverOpen && !nativeEditorSelectedText) {
      setSelectedTextPopoverOpen(false);
    }
  }, [nativeEditorSelectedText, isSelectedTextPopoverOpen]);

  const handleChange = useCallback(
    (queryText: string) => {
      if (query.queryText() !== queryText) {
        const updatedQuery = query.setQueryText(queryText);
        setDatasetQuery(updatedQuery);
      }
    },
    [query, setDatasetQuery],
  );

  const handleSnippetUpdate = useCallback(
    (newSnippet: NativeQuerySnippet, oldSnippet: NativeQuerySnippet) => {
      // get the query instance with the latest Metadata that has the updated snippet
      const updatedQuery = query.updateSnippet(oldSnippet, newSnippet);
      setDatasetQuery(updatedQuery);
    },
    [query, setDatasetQuery],
  );

  const handleRightClickSelection = useCallback(() => {
    setSelectedTextPopoverOpen(true);
  }, []);

  const focusEditor = useCallback(() => {
    if (readOnly) {
      return;
    }
    editorRef.current?.focus();
  }, [readOnly]);

  const toggleEditor = useCallback(() => {
    setIsNativeEditorOpen?.(!isNativeEditorOpen, shouldOpenDataReference);
  }, [setIsNativeEditorOpen, shouldOpenDataReference, isNativeEditorOpen]);

  const handleFormatQuery = useCallback(async () => {
    const query = question.query();
    const engine = Lib.engine(query);
    const queryText = Lib.rawNativeQuery(query);
    const canFormatQuery = engine != null && canFormatForEngine(engine);
    if (!canFormatQuery) {
      return undefined;
    }

    if (!engine || !canFormatForEngine(engine)) {
      // no engine found, do nothing
      return;
    }

    const formattedQuery = await formatQuery(queryText, engine);
    handleChange(formattedQuery);
    focusEditor();
  }, [question, focusEditor, handleChange]);

  const handleResize = useCallback(
    (height: number) => {
      handleResizeFromProps?.();

      // If the height is lower than the threshold for auto-closing,
      // close the editor
      if (height <= THRESHOLD_FOR_AUTO_CLOSE) {
        setIsNativeEditorOpen?.(false);
        return;
      }
    },
    [handleResizeFromProps, setIsNativeEditorOpen],
  );

  const contextValue: NativeQueryEditorContextValue = {
    question,
    query,
    setDatasetQuery,
    focusEditor,
    onFormatQuery: handleFormatQuery,
    readOnly,
    isNativeEditorOpen,
    setIsNativeEditorOpen,
    toggleEditor,
    canChangeDatabase,
    editorContext,
    databaseIsDisabled,
    databaseDisabledTooltip,
    onSetDatabaseId,
    setParameterValue,
    isRunnable,
    isRunning,
    isResultDirty,
    runQuery,
    cancelQuery,
    nativeEditorSelectedText,
    snippets,
    snippetCollections,
    isShowingDataReference,
    isShowingSnippetSidebar,
    isShowingTemplateTagsEditor,
    toggleDataReference,
    toggleSnippetSidebar,
    toggleTemplateTagsEditor,
    onOpenModal,
  };

  // Separate the top bar (rendered in the header) from the body slots (run
  // button, extra buttons, custom content rendered over the editor surface).
  let topBar: ReactNode = null;
  const bodySlots: ReactNode[] = [];
  Children.toArray(children).forEach((child) => {
    if (isValidElement(child) && child.type === TopBar) {
      topBar = cloneElement(child, { ref: topBarRef });
    } else {
      bodySlots.push(child);
    }
  });

  return (
    <NativeQueryEditorContextProvider value={contextValue}>
      <div
        className={cx(S.queryEditor, className, {
          [S.readOnlyEditor]: readOnly,
        })}
        data-testid="native-query-editor-container"
        ref={ref}
      >
        {topBar}
        <div className={S.editorWrapper}>
          {shouldShowEditor && (
            <ResizableArea
              resizable={resizable}
              minHeight={MIN_EDITOR_HEIGHT_AFTER_DRAGGING}
              maxHeight={
                availableHeight - topBarHeight - RESIZE_CONSTRAINT_OFFSET
              }
              onResize={handleResize}
              initialHeight={getInitialEditorHeight({ query, availableHeight })}
              className={S.resizableArea}
            >
              <Flex w="100%" flex="1" className={S.resizableBoxContent}>
                <CodeMirrorEditor
                  ref={editorRef}
                  query={question.query()}
                  proposedQuery={proposedQuestion?.query()}
                  readOnly={readOnly}
                  placeholder={placeholder}
                  highlightedLineNumbers={highlightedLineNumbers}
                  extensions={extensions}
                  onBlur={onBlur}
                  onChange={handleChange}
                  onRunQuery={runQuery}
                  onSelectionChange={setNativeEditorSelectedRange}
                  onCursorMoveOverCardTag={openDataReferenceAtQuestion}
                  onRightClickSelection={handleRightClickSelection}
                  onFormatQuery={handleFormatQuery}
                />

                <Stack
                  display={readOnly ? "none" : undefined}
                  gap="md"
                  justify="flex-end"
                  p="md"
                >
                  {proposedQuestion && onRejectProposed && onAcceptProposed && (
                    <>
                      <Tooltip
                        label={t`Accept proposed changes`}
                        position="top"
                      >
                        <Button
                          data-testid="accept-proposed-changes-button"
                          variant="filled"
                          bg="success"
                          px="0"
                          w="2.5rem"
                          onClick={() => {
                            const proposedQuery =
                              proposedQuestion.legacyNativeQuery();
                            if (proposedQuery) {
                              handleChange(proposedQuery.queryText());
                              onAcceptProposed(proposedQuery.datasetQuery());
                            }
                          }}
                        >
                          <Icon name="check" />
                        </Button>
                      </Tooltip>
                      <Tooltip
                        label={t`Reject proposed changes`}
                        position="top"
                      >
                        <Button
                          data-testid="reject-proposed-changes-button"
                          w="2.5rem"
                          px="0"
                          variant="filled"
                          bg="danger"
                          onClick={onRejectProposed}
                        >
                          <Icon name="close" />
                        </Button>
                      </Tooltip>
                    </>
                  )}
                  <Flex gap="sm">{bodySlots}</Flex>
                </Stack>
              </Flex>
            </ResizableArea>
          )}
        </div>

        <RightClickPopover
          isOpen={isSelectedTextPopoverOpen}
          openSnippetModalWithSelectedText={openSnippetModalWithSelectedText}
          runQuery={runQuery}
          target={() => editorRef.current?.getSelectionTarget()}
          canSaveSnippets={canSaveSnippets}
        />

        {modalSnippet && insertSnippet && closeSnippetModal && (
          <SnippetFormModal
            snippet={modalSnippet}
            onCreate={insertSnippet}
            onUpdate={handleSnippetUpdate}
            onClose={closeSnippetModal}
          />
        )}
      </div>
    </NativeQueryEditorContextProvider>
  );
});
