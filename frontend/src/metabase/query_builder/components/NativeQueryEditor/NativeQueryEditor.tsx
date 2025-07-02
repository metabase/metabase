import cx from "classnames";
import {
  Component,
  type ForwardedRef,
  createRef,
  forwardRef,
  useCallback,
} from "react";
import { ResizableBox, type ResizableBoxProps } from "react-resizable";
import _ from "underscore";

import ExplicitSize from "metabase/common/components/ExplicitSize";
import Modal from "metabase/common/components/Modal";
import Databases from "metabase/entities/databases";
import SnippetCollections from "metabase/entities/snippet-collections";
import Snippets from "metabase/entities/snippets";
import { useDispatch } from "metabase/lib/redux";
import {
  runQuestionOrSelectedQuery,
  setIsNativeEditorOpen,
  setUIControls,
} from "metabase/query_builder/actions";
import SnippetFormModal from "metabase/query_builder/components/template_tags/SnippetFormModal";
import type { QueryModalType } from "metabase/query_builder/constants";
import { useNotebookScreenSize } from "metabase/query_builder/hooks/use-notebook-screen-size";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  CardId,
  Collection,
  DatabaseId,
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
import { NativeQueryValidationError } from "./NativeQueryValidationError/NativeQueryValidationError";
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

  nativeEditorSelectedText?: string;
  modalSnippet?: NativeQuerySnippet;
  viewHeight: number;
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
  sidebarFeatures?: SidebarFeatures;
  resizable?: boolean;
  resizableBoxProps?: Partial<Omit<ResizableBoxProps, "axis">>;

  editorContext?: "question";

  runQuery: () => void;
  toggleEditor: () => void;
  handleResize: () => void;
  setDatasetQuery: (query: NativeQuery) => Promise<Question>;
  runQuestionQuery: (opts?: {
    overrideWithQuestion?: Question;
    shouldUpdateUrl?: boolean;
  }) => void;
  setNativeEditorSelectedRange: (range: SelectionRange[]) => void;
  openDataReferenceAtQuestion: (id: CardId) => void;
  openSnippetModalWithSelectedText: () => void;
  insertSnippet: (snippet: NativeQuerySnippet) => void;
  setIsNativeEditorOpen?: (isOpen: boolean) => void;
  setParameterValue: (parameterId: ParameterId, value: string) => void;
  onOpenModal: (modalType: QueryModalType) => void;
  toggleDataReference: () => void;
  toggleTemplateTagsEditor: () => void;
  toggleSnippetSidebar: () => void;
  cancelQuery?: () => void;
  closeSnippetModal: () => void;
  onSetDatabaseId?: (id: DatabaseId) => void;
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
      const updatedQuery = query
        .setQueryText(queryText)
        .updateSnippetsWithIds(this.props.snippets);

      setDatasetQuery(updatedQuery);
    }
  };

  focus() {
    if (this.props.readOnly) {
      return;
    }
    this.editor.current?.focus();
  }

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
      },
      hasTopBar = true,
      hasEditingSidebar = true,
      resizableBoxProps = {},
      snippetCollections = [],
      question,
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
        className={S.queryEditor}
        data-testid="native-query-editor-container"
        ref={forwardedRef}
      >
        {hasTopBar && (
          <NativeQueryEditorTopBar
            hasEditingSidebar={hasEditingSidebar}
            question={question}
            query={query}
            onChange={this.onChange}
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
            nativeEditorSelectedText={this.props.nativeEditorSelectedText}
            editorContext={this.props.editorContext}
            onSetDatabaseId={this.props.onSetDatabaseId}
            isShowingSnippetSidebar={this.props.isShowingSnippetSidebar}
            isNativeEditorOpen={this.props.isNativeEditorOpen}
            toggleEditor={this.props.toggleEditor}
            setParameterValue={this.props.setParameterValue}
            setDatasetQuery={this.props.setDatasetQuery}
            onFormatQuery={canFormatQuery ? this.handleFormatQuery : undefined}
          />
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
              this.props.handleResize();
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
            <>
              <Flex w="100%" flex="1" className={S.resizableBoxContent}>
                <CodeMirrorEditor
                  ref={this.editor}
                  query={question.query()}
                  readOnly={readOnly}
                  highlightedLineNumbers={highlightedLineNumbers}
                  onChange={this.onChange}
                  onRunQuery={runQuery}
                  onSelectionChange={setNativeEditorSelectedRange}
                  onCursorMoveOverCardTag={openDataReferenceAtQuestion}
                  onRightClickSelection={this.handleRightClickSelection}
                  onFormatQuery={
                    canFormatQuery ? this.handleFormatQuery : undefined
                  }
                />

                {hasEditingSidebar && !readOnly && (
                  <NativeQueryEditorRunButton
                    cancelQuery={this.props.cancelQuery}
                    isResultDirty={this.props.isResultDirty}
                    isRunnable={this.props.isRunnable}
                    isRunning={this.props.isRunning}
                    nativeEditorSelectedText={
                      this.props.nativeEditorSelectedText
                    }
                    runQuery={this.props.runQuery}
                  />
                )}
              </Flex>

              <NativeQueryValidationError query={query.question().query()} />
            </>
          </ResizableBox>
        </div>

        <RightClickPopover
          isOpen={this.state.isSelectedTextPopoverOpen}
          openSnippetModalWithSelectedText={openSnippetModalWithSelectedText}
          runQuery={runQuery}
          target={() => this.editor.current?.getSelectionTarget()}
          canSaveSnippets={canSaveSnippets}
        />

        {this.props.modalSnippet && (
          <Modal onClose={this.props.closeSnippetModal}>
            <SnippetFormModal
              snippet={this.props.modalSnippet}
              onCreate={this.props.insertSnippet}
              onUpdate={(newSnippet, oldSnippet) => {
                if (newSnippet.name !== oldSnippet.name) {
                  setDatasetQuery(query.updateSnippetNames([newSnippet]));
                }
              }}
              onClose={this.props.closeSnippetModal}
            />
          </Modal>
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
    dispatch(runQuestionOrSelectedQuery());
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
