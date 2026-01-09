import { useElementSize } from "@mantine/hooks";
import {
  type ForwardedRef,
  type ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Resizable } from "react-resizable";
import { useMount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import ExplicitSize from "metabase/common/components/ExplicitSize";
import { Databases } from "metabase/entities/databases";
import { SnippetCollections } from "metabase/entities/snippet-collections";
import { Snippets } from "metabase/entities/snippets";
import { SnippetFormModal } from "metabase/query_builder/components/template_tags/SnippetFormModal";
import type { QueryModalType } from "metabase/query_builder/constants";
import { useNotebookScreenSize } from "metabase/query_builder/hooks/use-notebook-screen-size";
import { Button, Flex, Icon, Stack, Tooltip } from "metabase/ui";
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
  canFormatForEngine,
  formatQuery,
  getInitialEditorHeight,
} from "./utils";

type OwnProps = {
  availableHeight?: number;
  canChangeDatabase?: boolean;
  cancelQuery?: () => void;
  closeSnippetModal?: () => void;
  databaseIsDisabled?: (database: Database) => boolean;
  editorContext?: "question";
  handleResize?: () => void;
  hasEditingSidebar?: boolean;
  hasParametersList?: boolean;
  hasRunButton?: boolean;
  hasTopBar?: boolean;
  highlightedLineNumbers?: number;
  insertSnippet?: (snippet: NativeQuerySnippet) => void;
  isInitiallyOpen?: boolean;
  isNativeEditorOpen: boolean;
  isResultDirty: boolean;
  isRunnable: boolean;
  isRunning: boolean;
  isShowingDataReference: boolean;
  isShowingSnippetSidebar: boolean;
  isShowingTemplateTagsEditor: boolean;
  modalSnippet?: NativeQuerySnippet;
  nativeEditorSelectedText?: string;
  onAcceptProposed?: (query: DatasetQuery) => void;
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
  runQuery: () => void;
  setDatasetQuery: (query: NativeQuery) => Promise<Question>;
  setIsNativeEditorOpen?: (
    isOpen: boolean,
    shouldOpenDataReference?: boolean,
  ) => void;
  setNativeEditorSelectedRange?: (range: SelectionRange[]) => void;
  setParameterValue?: (parameterId: ParameterId, value: string) => void;
  sidebarFeatures?: SidebarFeatures;
  toggleDataReference: () => void;
  toggleSnippetSidebar?: () => void;
  toggleTemplateTagsEditor: () => void;
  topBarInnerContent?: ReactNode;
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
      runQuery,
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

    const editorRef = useRef<CodeMirrorEditorRef>(null);
    const { ref: topBarRef, height: topBarHeight } = useElementSize();

    const [isSelectedTextPopoverOpen, setSelectedTextPopoverOpen] =
      useState(false);

    const maxHeight =
      availableHeight != null
        ? availableHeight - topBarHeight - RESIZE_CONSTRAINT_OFFSET
        : Infinity;

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

    useMount(() => {
      if (typeof isInitiallyOpen !== "undefined") {
        setIsNativeEditorOpen?.(isInitiallyOpen);
      } else {
        setIsNativeEditorOpen?.(!question || !question.isSaved());
      }
    });

    useEffect(() => {
      // Close selected text popover if text is deselected
      if (isSelectedTextPopoverOpen && !nativeEditorSelectedText) {
        setSelectedTextPopoverOpen(false);
      }
    }, [nativeEditorSelectedText, isSelectedTextPopoverOpen]);

    const canSaveSnippets = snippetCollections.some(
      (collection) => collection.can_write,
    );

    const engine = Lib.engine(question.query());
    const canFormatQuery = engine != null && canFormatForEngine(engine);

    // do not show reference sidebar on small screens automatically
    const screenSize = useNotebookScreenSize();
    const shouldOpenDataReference = screenSize !== "small";

    const toggleEditor = useCallback(() => {
      setIsNativeEditorOpen?.(!isNativeEditorOpen, shouldOpenDataReference);
    }, [setIsNativeEditorOpen, shouldOpenDataReference, isNativeEditorOpen]);

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
          {isNativeEditorOpen && (
            <ResizableArea
              resizable={resizable}
              maxHeight={maxHeight}
              onResize={handleResize}
              initialHeight={getInitialEditorHeight({ query, availableHeight })}
              collapseEditor={() => setIsNativeEditorOpen?.(false)}
              className={S.resizableArea}
            >
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
                    <Tooltip label={t`Accept proposed changes`} position="top">
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
                    <Tooltip label={t`Reject proposed changes`} position="top">
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
                    questionErrors={Lib.validateTemplateTags(question.query())}
                  />
                )}
              </Stack>
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

function ResizableArea(props: {
  children: ReactNode;
  resizable: boolean;
  initialHeight: number;
  maxHeight: number;
  onResize?: () => void;
  collapseEditor?: () => void;
  className?: string;
}) {
  const {
    children,
    resizable,
    initialHeight,
    maxHeight,
    onResize,
    collapseEditor,
    className,
  } = props;

  const [height, setHeight] = useState(initialHeight);

  const resize = useCallback(
    (height: number) => {
      onResize?.();

      // If the height is lower than the threshold for auto-closing,
      // close the editor
      if (height <= THRESHOLD_FOR_AUTO_CLOSE) {
        collapseEditor?.();
        return;
      }
      setHeight(height);
    },
    [collapseEditor, onResize],
  );

  const handleResize = useCallback(
    (_event: unknown, data: { size: { height: number } }) => {
      const { height } = data.size;
      resize(height);
    },
    [resize],
  );

  useEffect(() => {
    // If the height is higher than the max height,
    // resize to the max height
    if (maxHeight == null) {
      return;
    }
    if (height >= maxHeight) {
      resize(maxHeight);
    }
  }, [height, maxHeight, resize]);

  const dragHandle = resizable ? (
    <div className={S.dragHandleContainer} data-testid="drag-handle">
      <div className={S.dragHandle} />
    </div>
  ) : null;

  return (
    <Resizable
      height={height}
      minConstraints={[Infinity, MIN_EDITOR_HEIGHT_AFTER_DRAGGING]}
      maxConstraints={[Infinity, maxHeight]}
      axis="y"
      handle={dragHandle}
      resizeHandles={["s"]}
      onResize={handleResize}
      onResizeStop={handleResize}
    >
      <Flex w="100%" flex="1" h={height} className={className}>
        {children}
      </Flex>
    </Resizable>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.loadList({ loadingAndErrorWrapper: false }),
  Snippets.loadList({ loadingAndErrorWrapper: false }),
  SnippetCollections.loadList({ loadingAndErrorWrapper: false }),
  ExplicitSize(),
)(NativeQueryEditor);
