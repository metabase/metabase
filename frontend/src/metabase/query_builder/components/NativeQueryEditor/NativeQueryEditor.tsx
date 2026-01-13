import cx from "classnames";
import {
  Component,
  type ForwardedRef,
  type ReactNode,
  createRef,
  forwardRef,
  useCallback,
} from "react";
import { ResizableBox, type ResizableBoxProps } from "react-resizable";
import { t } from "ttag";
import _ from "underscore";

import ExplicitSize from "metabase/common/components/ExplicitSize";
import { Databases } from "metabase/entities/databases";
import { SnippetCollections } from "metabase/entities/snippet-collections";
import { Snippets } from "metabase/entities/snippets";
import { useDispatch } from "metabase/lib/redux";
import {
  runOrCancelQuestionOrSelectedQuery,
  setIsNativeEditorOpen,
  setUIControls,
} from "metabase/query_builder/actions";
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
  viewHeight: number;
  placeholder?: string;
  highlightedLineNumbers?: number[];

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
  resizableBoxProps?: Partial<Omit<ResizableBoxProps, "axis">>;

  editorContext?: "question";

  runQuery: () => void;
  toggleEditor?: () => void;
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

interface NativeQueryEditorState {
  initialHeight: number;
  isSelectedTextPopoverOpen: boolean;
  isCollapsing: boolean;
}

class NativeQueryEditor extends Component<Props, NativeQueryEditorState> {
  resizeBox = createRef<HTMLDivElement & ResizableBox>();
  editor = createRef<CodeMirrorEditorRef>();

  constructor(props: Props) {
    super(props);

    const { query, viewHeight } = props;
    this.state = {
      initialHeight: calcInitialEditorHeight({ query, viewHeight }),
      isSelectedTextPopoverOpen: false,
      isCollapsing: false,
    };
  }

  UNSAFE_componentWillMount() {
    const { question, setIsNativeEditorOpen, isInitiallyOpen } = this.props;

    if (typeof isInitiallyOpen !== "undefined") {
      setIsNativeEditorOpen?.(isInitiallyOpen);
      return;
    }

    setIsNativeEditorOpen?.(!question || !question.isSaved());
  }

  componentDidUpdate(prevProps: Props) {
    if (
      this.state.isSelectedTextPopoverOpen &&
      !this.props.nativeEditorSelectedText &&
      prevProps.nativeEditorSelectedText
    ) {
      // close selected text popover if text is deselected
      this.setState({ isSelectedTextPopoverOpen: false });
    }

    if (this.props.isNativeEditorOpen && !prevProps.isNativeEditorOpen) {
      const { query, viewHeight } = this.props;
      const newHeight = calcInitialEditorHeight({ query, viewHeight });
      this.setState({ initialHeight: newHeight });
    }
  }

  onChange = (queryText: string) => {
    const { query, setDatasetQuery } = this.props;
    if (query.queryText() !== queryText) {
      const updatedQuery = query.setQueryText(queryText);
      setDatasetQuery(updatedQuery);
    }
  };

  focus = () => {
    if (this.props.readOnly) {
      return;
    }
    this.editor.current?.focus();
  };

  handleRightClickSelection = () => {
    this.setState({ isSelectedTextPopoverOpen: true });
  };

  handleTransitionEnd = () => {
    if (this.state.isCollapsing) {
      this.setState({
        isCollapsing: false,
        initialHeight: MIN_EDITOR_HEIGHT_AFTER_DRAGGING,
      });
    }
  };

  handleFormatQuery = async () => {
    const { question } = this.props;
    const query = question.query();
    const engine = Lib.engine(query);
    const queryText = Lib.rawNativeQuery(query);

    if (!engine || !canFormatForEngine(engine)) {
      // no engine found, do nothing
      return;
    }

    const formattedQuery = await formatQuery(queryText, engine);
    this.onChange(formattedQuery);
    this.focus();
  };

  render() {
    const {
      canChangeDatabase = true,
      resizable = true,
      sidebarFeatures = {
        dataReference: true,
        variables: true,
        snippets: true,
        promptInput: true,
        formatQuery: true,
      },
      hasTopBar = true,
      hasEditingSidebar = true,
      hasRunButton = hasEditingSidebar,
      resizableBoxProps = {},
      snippetCollections = [],
      question,
      proposedQuestion,
      onRejectProposed,
      onAcceptProposed,
      query,
      readOnly,
      isNativeEditorOpen,
      openSnippetModalWithSelectedText,
      openDataReferenceAtQuestion,
      setDatasetQuery,
      setNativeEditorSelectedRange,
      forwardedRef,
      runQuery,
      highlightedLineNumbers,
      placeholder,
      extensions,
    } = this.props;

    const dragHandle = resizable ? (
      <div className={S.dragHandleContainer} data-testid="drag-handle">
        <div className={S.dragHandle} />
      </div>
    ) : null;

    const canSaveSnippets = snippetCollections.some(
      (collection) => collection.can_write,
    );

    const engine = Lib.engine(question.query());
    const canFormatQuery = engine != null && canFormatForEngine(engine);

    return (
      <div
        className={cx(S.queryEditor, { [S.readOnlyEditor]: readOnly })}
        data-testid="native-query-editor-container"
        ref={forwardedRef}
      >
        {hasTopBar && (
          <NativeQueryEditorTopBar
            hasEditingSidebar={hasEditingSidebar}
            question={question}
            query={query}
            focus={this.focus}
            canChangeDatabase={canChangeDatabase}
            sidebarFeatures={sidebarFeatures}
            isRunnable={this.props.isRunnable}
            isRunning={this.props.isRunning}
            hasParametersList={this.props.hasParametersList}
            isResultDirty={this.props.isResultDirty}
            isShowingDataReference={this.props.isShowingDataReference}
            onOpenModal={this.props.onOpenModal}
            isShowingTemplateTagsEditor={this.props.isShowingTemplateTagsEditor}
            setIsNativeEditorOpen={this.props.setIsNativeEditorOpen}
            snippets={this.props.snippets}
            editorContext={this.props.editorContext}
            onSetDatabaseId={this.props.onSetDatabaseId}
            isShowingSnippetSidebar={this.props.isShowingSnippetSidebar}
            isNativeEditorOpen={this.props.isNativeEditorOpen}
            toggleEditor={this.props.toggleEditor}
            toggleDataReference={this.props.toggleDataReference}
            toggleSnippetSidebar={this.props.toggleSnippetSidebar}
            setParameterValue={this.props.setParameterValue}
            setDatasetQuery={this.props.setDatasetQuery}
            onFormatQuery={canFormatQuery ? this.handleFormatQuery : undefined}
            databaseIsDisabled={this.props.databaseIsDisabled}
            readOnly={readOnly}
          >
            {this.props.topBarInnerContent}
          </NativeQueryEditorTopBar>
        )}
        <div
          className={S.editorWrapper}
          onTransitionEnd={this.handleTransitionEnd}
        >
          <ResizableBox
            ref={this.resizeBox}
            height={this.state.initialHeight}
            className={cx(
              S.resizableBox,
              isNativeEditorOpen && S.open,
              this.state.isCollapsing && S.collapsing,
            )}
            minConstraints={[Infinity, MIN_EDITOR_HEIGHT_AFTER_DRAGGING]}
            axis="y"
            handle={dragHandle}
            resizeHandles={["s"]}
            {...resizableBoxProps}
            onResizeStop={(e, data) => {
              this.props.handleResize?.();
              if (typeof resizableBoxProps?.onResizeStop === "function") {
                resizableBoxProps.onResizeStop(e, data);
              }
              const size = data.size;

              if (size.height < THRESHOLD_FOR_AUTO_CLOSE) {
                // Start animation to collapse
                this.setState({ isCollapsing: true });
                this.props.setIsNativeEditorOpen?.(false);
              }
            }}
          >
            <Flex w="100%" flex="1" className={S.resizableBoxContent}>
              <CodeMirrorEditor
                ref={this.editor}
                query={question.query()}
                proposedQuery={proposedQuestion?.query()}
                readOnly={readOnly}
                placeholder={placeholder}
                highlightedLineNumbers={highlightedLineNumbers}
                extensions={extensions}
                onChange={this.onChange}
                onRunQuery={runQuery}
                onSelectionChange={setNativeEditorSelectedRange}
                onCursorMoveOverCardTag={openDataReferenceAtQuestion}
                onRightClickSelection={this.handleRightClickSelection}
                onFormatQuery={
                  canFormatQuery ? this.handleFormatQuery : undefined
                }
              />

              <Stack
                display={readOnly ? "none" : undefined}
                gap="md"
                m="1rem"
                mt="auto"
              >
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
                            this.onChange(proposedQuery.queryText());
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
                {hasRunButton && (
                  <NativeQueryEditorRunButton
                    cancelQuery={this.props.cancelQuery}
                    isResultDirty={this.props.isResultDirty}
                    isRunnable={this.props.isRunnable}
                    isRunning={this.props.isRunning}
                    nativeEditorSelectedText={
                      this.props.nativeEditorSelectedText
                    }
                    runQuery={this.props.runQuery}
                    questionErrors={Lib.validateTemplateTags(question.query())}
                  />
                )}
              </Stack>
            </Flex>
          </ResizableBox>
        </div>

        <RightClickPopover
          isOpen={this.state.isSelectedTextPopoverOpen}
          openSnippetModalWithSelectedText={openSnippetModalWithSelectedText}
          runQuery={runQuery}
          target={() => this.editor.current?.getSelectionTarget()}
          canSaveSnippets={canSaveSnippets}
        />

        {this.props.modalSnippet &&
          this.props.insertSnippet &&
          this.props.closeSnippetModal && (
            <SnippetFormModal
              snippet={this.props.modalSnippet}
              onCreate={this.props.insertSnippet}
              onUpdate={(newSnippet, oldSnippet) => {
                // get the query instance with the latest Metadata that has the updated snippet
                const newQuery = this.props.query.updateSnippet(
                  oldSnippet,
                  newSnippet,
                );
                setDatasetQuery(newQuery);
              }}
              onClose={this.props.closeSnippetModal}
            />
          )}
      </div>
    );
  }
}

const NativeQueryEditorWrapper = forwardRef<
  HTMLDivElement,
  Omit<Props, "runQuery" | "toggleEditor">
>(function NativeQueryEditorWrapper(props, ref) {
  const screenSize = useNotebookScreenSize();
  const dispatch = useDispatch();
  const { isNativeEditorOpen } = props;

  const runQuery = useCallback(() => {
    dispatch(runOrCancelQuestionOrSelectedQuery());
  }, [dispatch]);

  /**
   * do not show reference sidebar on small screens automatically
   */
  const toggleEditor = useCallback(() => {
    if (screenSize === "small") {
      dispatch(setUIControls({ isNativeEditorOpen: !isNativeEditorOpen }));
    } else {
      dispatch(setIsNativeEditorOpen(!isNativeEditorOpen));
    }
  }, [dispatch, isNativeEditorOpen, screenSize]);

  return (
    <NativeQueryEditor
      runQuery={runQuery}
      toggleEditor={toggleEditor}
      {...props}
      forwardedRef={ref}
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.loadList({ loadingAndErrorWrapper: false }),
  Snippets.loadList({ loadingAndErrorWrapper: false }),
  SnippetCollections.loadList({ loadingAndErrorWrapper: false }),
  ExplicitSize(),
)(NativeQueryEditorWrapper);
