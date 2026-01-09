import { useElementSize } from "@mantine/hooks";
import cx from "classnames";
import {
  type ForwardedRef,
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Resizable, type ResizableProps } from "react-resizable";
import { useMount, usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import ExplicitSize from "metabase/common/components/ExplicitSize";
import { Databases } from "metabase/entities/databases";
import { SnippetCollections } from "metabase/entities/snippet-collections";
import { Snippets } from "metabase/entities/snippets";
import { useDispatch } from "metabase/lib/redux";
import {
  runOrCancelQuestionOrSelectedQuery,
  setUIControls,
} from "metabase/query_builder/actions";
import { SnippetFormModal } from "metabase/query_builder/components/template_tags/SnippetFormModal";
import type { QueryModalType } from "metabase/query_builder/constants";
import { useNotebookScreenSize } from "metabase/query_builder/hooks/use-notebook-screen-size";
import { Box, Button, Flex, Icon, Stack, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  CardId,
  Collection,
  DatabaseId,
  DatasetQuery,
  NativeQuerySnippet,
  ParameterId,
} from "metabase-types/api";

import {
  CodeMirrorEditor,
  type CodeMirrorEditorProps,
  type CodeMirrorEditorRef,
} from "./CodeMirrorEditor";
import S from "./NativeQueryEditor.module.css";
import { NativeQueryEditorRunButton } from "./NativeQueryEditorRunButton/NativeQueryEditorRunButton";
import { NativeQueryEditorTopBar } from "./NativeQueryEditorTopBar/NativeQueryEditorTopBar";
import { RightClickPopover } from "./RightClickPopover";
import {
  MIN_EDITOR_HEIGHT_AFTER_DRAGGING,
  RESIZE_CONSTRAINT_OFFSET,
  THRESHOLD_FOR_AUTO_CLOSE,
} from "./constants";
import type { SelectionRange, SidebarFeatures } from "./types";
import {
  calcInitialEditorHeight,
  canFormatForEngine,
  formatQuery,
} from "./utils";

type OwnProps = {
  question: Question;
  query: NativeQuery;

  proposedQuestion?: Question | undefined;
  onRejectProposed?: () => void;
  onAcceptProposed?: (query: DatasetQuery) => void;

  nativeEditorSelectedText?: string;
  modalSnippet?: NativeQuerySnippet;
  placeholder?: string;
  highlightedLineNumbers?: number;

  isInitiallyOpen?: boolean;
  isNativeEditorOpen: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;

  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingSnippetSidebar: boolean;

  readOnly?: boolean;
  canChangeDatabase?: boolean;
  hasTopBar?: boolean;
  hasParametersList?: boolean;
  hasEditingSidebar?: boolean;
  hasRunButton?: boolean;
  sidebarFeatures?: SidebarFeatures;
  resizable?: boolean;
  resizableBoxProps?: Partial<Omit<ResizableProps, "axis">>;

  editorContext?: "question";

  handleResize?: () => void;
  setDatasetQuery: (query: NativeQuery) => Promise<Question>;
  runQuestionQuery: (opts?: {
    overrideWithQuestion?: Question;
    shouldUpdateUrl?: boolean;
  }) => void;
  setNativeEditorSelectedRange?: (range: SelectionRange[]) => void;
  openDataReferenceAtQuestion?: (id: CardId) => void;
  openSnippetModalWithSelectedText?: () => void;
  insertSnippet?: (snippet: NativeQuerySnippet) => void;
  setIsNativeEditorOpen?: (isOpen: boolean) => void;
  setParameterValue?: (parameterId: ParameterId, value: string) => void;
  onOpenModal?: (modalType: QueryModalType) => void;
  toggleDataReference: () => void;
  toggleTemplateTagsEditor: () => void;
  toggleSnippetSidebar?: () => void;
  cancelQuery?: () => void;
  closeSnippetModal?: () => void;
  onSetDatabaseId?: (id: DatabaseId) => void;
  databaseIsDisabled?: (database: Database) => boolean;
  topBarInnerContent?: ReactNode;
  availableHeight?: number;
};

interface ExplicitSizeProps {
  width: number;
  height: number;
}

interface EntityLoaderProps {
  snippets?: NativeQuerySnippet[];
  snippetCollections?: Collection[];
}

type Props = OwnProps &
  ExplicitSizeProps &
  EntityLoaderProps &
  Omit<CodeMirrorEditorProps, "query"> & {
    forwardedRef?: ForwardedRef<HTMLDivElement>;
  };

const NativeQueryEditor = forwardRef<HTMLDivElement, Props>(
  function NativeQueryEditorInner(props) {
    const {
      availableHeight,
      canChangeDatabase = true,
      cancelQuery,
      closeSnippetModal,
      databaseIsDisabled,
      editorContext,
      extensions,
      forwardedRef,
      handleResize,
      hasEditingSidebar = true,
      hasParametersList,
      hasRunButton = hasEditingSidebar,
      hasTopBar = true,
      highlightedLineNumbers,
      insertSnippet,
      isNativeEditorOpen,
      isInitiallyOpen,
      isResultDirty,
      isRunnable,
      isRunning,
      isShowingDataReference,
      isShowingSnippetSidebar,
      isShowingTemplateTagsEditor,
      modalSnippet,
      nativeEditorSelectedText,
      onAcceptProposed,
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
      resizableBoxProps = {},
      setDatasetQuery,
      setIsNativeEditorOpen,
      setNativeEditorSelectedRange,
      setParameterValue,
      sidebarFeatures = {
        dataReference: true,
        variables: true,
        snippets: true,
        promptInput: true,
        formatQuery: true,
      },
      snippetCollections = [],
      snippets,
      toggleDataReference,
      toggleSnippetSidebar,
      topBarInnerContent,
    } = props;
    const dispatch = useDispatch();

    const editorRef = useRef<CodeMirrorEditorRef>(null);
    const { ref: topBarRef, height: topBarHeight } = useElementSize();

    const [height, setHeight] = useState(
      calcInitialEditorHeight({ query, availableHeight }),
    );
    const [isSelectedTextPopoverOpen, setSelectedTextPopoverOpen] =
      useState(false);

    const wasNativeEditorOpen = usePrevious(isNativeEditorOpen);

    const maxHeight =
      availableHeight != null
        ? availableHeight - topBarHeight - RESIZE_CONSTRAINT_OFFSET
        : Infinity;

    const runQuery = useCallback(() => {
      dispatch(runOrCancelQuestionOrSelectedQuery());
    }, [dispatch]);

    const handleChange = useCallback(
      (queryText: string) => {
        if (query.queryText() !== queryText) {
          const updatedQuery = query.setQueryText(queryText);
          setDatasetQuery(updatedQuery);
        }
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

    const closeEditor = useCallback(() => {
      setIsNativeEditorOpen?.(false);
      setHeight(calcInitialEditorHeight({ query, availableHeight }));
    }, [setIsNativeEditorOpen, query, availableHeight]);

    const resizeEditor = useCallback(
      (height: number) => {
        // If the height is lower than the threshold for auto-closing,
        // close the editor
        if (height <= THRESHOLD_FOR_AUTO_CLOSE) {
          closeEditor();
          return;
        }
        setHeight(height);
      },
      [closeEditor],
    );

    useMount(() => {
      if (typeof isInitiallyOpen !== "undefined") {
        setIsNativeEditorOpen?.(isInitiallyOpen);
      } else {
        setIsNativeEditorOpen?.(!question || !question.isSaved());
      }
    });

    useEffect(() => {
      // if the height is higher than the max height,
      // resize to the max height
      if (maxHeight == null) {
        return;
      }
      if (height >= maxHeight) {
        resizeEditor(maxHeight);
      }
    }, [height, maxHeight, resizeEditor]);

    useEffect(() => {
      // Close selected text popover if text is deselected
      if (isSelectedTextPopoverOpen && !nativeEditorSelectedText) {
        setSelectedTextPopoverOpen(false);
      }
    }, [nativeEditorSelectedText, isSelectedTextPopoverOpen]);

    useEffect(() => {
      // Recalculate height when opening native editor
      if (isNativeEditorOpen && !wasNativeEditorOpen) {
        const newHeight = calcInitialEditorHeight({ query, availableHeight });
        setHeight(newHeight);
      }
    }, [query, availableHeight, isNativeEditorOpen, wasNativeEditorOpen]);

    const dragHandle =
      resizable && isNativeEditorOpen ? (
        <div className={S.dragHandleContainer} data-testid="drag-handle">
          <div className={S.dragHandle} />
        </div>
      ) : null;

    const canSaveSnippets = snippetCollections.some(
      (collection) => collection.can_write,
    );

    const engine = Lib.engine(question.query());
    const canFormatQuery = engine != null && canFormatForEngine(engine);

    const screenSize = useNotebookScreenSize();

    /**
     * do not show reference sidebar on small screens automatically
     */
    const toggleEditor = useCallback(() => {
      if (screenSize === "small") {
        dispatch(setUIControls({ isNativeEditorOpen: !isNativeEditorOpen }));
      } else {
        setIsNativeEditorOpen?.(!isNativeEditorOpen);
      }
    }, [dispatch, isNativeEditorOpen, setIsNativeEditorOpen, screenSize]);

    const handleFormatQuery = useCallback(async () => {
      if (!canFormatQuery) {
        return;
      }
      const query = question.query();
      const engine = Lib.engine(query);
      const queryText = Lib.rawNativeQuery(query);

      if (!engine || !canFormatForEngine(engine)) {
        // no engine found, do nothing
        return;
      }

      const formattedQuery = await formatQuery(queryText, engine);
      handleChange(formattedQuery);
      focusEditor();
    }, [question, canFormatQuery, focusEditor, handleChange]);

    return (
      <div
        className={S.queryEditor}
        data-testid="native-query-editor-container"
        ref={forwardedRef}
      >
        {hasTopBar && (
          <NativeQueryEditorTopBar
            ref={topBarRef}
            hasEditingSidebar={hasEditingSidebar}
            question={question}
            query={query}
            focus={focusEditor}
            canChangeDatabase={canChangeDatabase}
            sidebarFeatures={sidebarFeatures}
            isRunnable={isRunnable}
            isRunning={isRunning}
            hasParametersList={hasParametersList}
            isResultDirty={isResultDirty}
            isShowingDataReference={isShowingDataReference}
            onOpenModal={onOpenModal}
            isShowingTemplateTagsEditor={isShowingTemplateTagsEditor}
            setIsNativeEditorOpen={setIsNativeEditorOpen}
            snippets={snippets}
            editorContext={editorContext}
            onSetDatabaseId={onSetDatabaseId}
            isShowingSnippetSidebar={isShowingSnippetSidebar}
            isNativeEditorOpen={isNativeEditorOpen}
            toggleEditor={toggleEditor}
            toggleDataReference={toggleDataReference}
            toggleSnippetSidebar={toggleSnippetSidebar}
            setParameterValue={setParameterValue}
            setDatasetQuery={setDatasetQuery}
            onFormatQuery={canFormatQuery ? handleFormatQuery : undefined}
            databaseIsDisabled={databaseIsDisabled}
            readOnly={readOnly}
          >
            {topBarInnerContent}
          </NativeQueryEditorTopBar>
        )}
        <div className={S.editorWrapper}>
          <Resizable
            height={height}
            minConstraints={[Infinity, MIN_EDITOR_HEIGHT_AFTER_DRAGGING]}
            maxConstraints={[Infinity, maxHeight]}
            axis="y"
            handle={dragHandle}
            resizeHandles={["s"]}
            {...resizableBoxProps}
            onResize={(event, data) => {
              resizableBoxProps.onResizeStop?.(event, data);
              resizeEditor(data.size.height);
            }}
            onResizeStop={(event, data) => {
              resizableBoxProps.onResizeStop?.(event, data);
              handleResize?.();
              resizeEditor(data.size.height);
            }}
          >
            <Box
              h={height}
              className={cx(S.resizableBox, isNativeEditorOpen && S.open)}
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
                  onChange={handleChange}
                  onRunQuery={runQuery}
                  onSelectionChange={setNativeEditorSelectedRange}
                  onCursorMoveOverCardTag={openDataReferenceAtQuestion}
                  onRightClickSelection={handleRightClickSelection}
                  onFormatQuery={canFormatQuery ? handleFormatQuery : undefined}
                />

                <Stack m="1rem" gap="md" mt="auto">
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
                  {hasRunButton && !readOnly && (
                    <NativeQueryEditorRunButton
                      cancelQuery={cancelQuery}
                      isResultDirty={isResultDirty}
                      isRunnable={isRunnable}
                      isRunning={isRunning}
                      nativeEditorSelectedText={nativeEditorSelectedText}
                      runQuery={runQuery}
                      questionErrors={Lib.validateTemplateTags(
                        question.query(),
                      )}
                    />
                  )}
                </Stack>
              </Flex>
            </Box>
          </Resizable>
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
            onUpdate={(newSnippet, oldSnippet) => {
              // get the query instance with the latest Metadata that has the updated snippet
              const newQuery = query.updateSnippet(oldSnippet, newSnippet);
              setDatasetQuery(newQuery);
            }}
            onClose={closeSnippetModal}
          />
        )}
      </div>
    );
  },
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.loadList({ loadingAndErrorWrapper: false }),
  Snippets.loadList({ loadingAndErrorWrapper: false }),
  SnippetCollections.loadList({ loadingAndErrorWrapper: false }),
  ExplicitSize(),
)(NativeQueryEditor);
