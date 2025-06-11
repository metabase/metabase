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

import ExplicitSize from "metabase/components/ExplicitSize";
import Modal from "metabase/components/Modal";
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
import type { Features as SidebarFeatures } from "./NativeQueryEditorActionButtons";
import { NativeQueryEditorRunButton } from "./NativeQueryEditorRunButton/NativeQueryEditorRunButton";
import { NativeQueryEditorTopBar } from "./NativeQueryEditorTopBar/NativeQueryEditorTopBar";
import { RightClickPopover } from "./RightClickPopover";
import { MIN_HEIGHT_LINES } from "./constants";
import type { SelectionRange } from "./types";
import {
  calcInitialEditorHeight,
  getEditorLineHeight,
  getMaxAutoSizeLines,
} from "./utils";

type OwnProps = typeof NativeQueryEditor.defaultProps & {
  question: Question;
  query: NativeQuery;

  nativeEditorSelectedText?: string;
  modalSnippet?: NativeQuerySnippet;
  viewHeight: number;
  highlightedLineNumbers?: number[];

  isOpen?: boolean;
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
  setParameterValueToDefault: (parameterId: ParameterId) => void;
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
  mobileShowParameterList: boolean;
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
      mobileShowParameterList: false,
    };
  }

  static defaultProps = {
    isOpen: false,
    canChangeDatabase: true,
    resizable: true,
    sidebarFeatures: {
      dataReference: true,
      variables: true,
      snippets: true,
      promptInput: true,
    },
  };

  UNSAFE_componentWillMount() {
    const { question, setIsNativeEditorOpen, isInitiallyOpen } = this.props;

    if (typeof isInitiallyOpen !== "undefined") {
      setIsNativeEditorOpen?.(isInitiallyOpen);
      return;
    }

    setIsNativeEditorOpen?.(!question || !question.isSaved());
  }

  onChange = (queryText: string) => {
    const { query, setDatasetQuery } = this.props;
    if (query.queryText() !== queryText) {
      setDatasetQuery(
        query
          .setQueryText(queryText)
          .updateSnippetsWithIds(this.props.snippets),
      );
    }
  };

  componentDidUpdate(prevProps: Props) {
    if (
      this.state.isSelectedTextPopoverOpen &&
      !this.props.nativeEditorSelectedText &&
      prevProps.nativeEditorSelectedText
    ) {
      // close selected text popover if text is deselected
      this.setState({ isSelectedTextPopoverOpen: false });
    }
  }

  focus() {
    if (this.props.readOnly) {
      return;
    }
    this.editor.current?.focus();
  }

  handleFilterButtonClick = () => {
    this.setState({
      mobileShowParameterList: !this.state.mobileShowParameterList,
    });
  };

  handleRightClickSelection = () => {
    this.setState({ isSelectedTextPopoverOpen: true });
  };

  _updateSize(doc: string) {
    const { viewHeight } = this.props;

    const element = this.resizeBox.current;

    if (!doc || !element) {
      return;
    }

    const lines = doc.split("\n").length;
    const newHeight = getEditorLineHeight(
      Math.max(
        Math.min(lines, getMaxAutoSizeLines(viewHeight)),
        MIN_HEIGHT_LINES,
      ),
    );

    if (newHeight > element.offsetHeight) {
      element.style.height = `${newHeight}px`;
    }
  }

  handleQueryGenerated = (queryText: string) => {
    this.onChange(queryText);
    this.focus();
  };

  render() {
    const {
      question,
      query,
      readOnly,
      isNativeEditorOpen,
      openSnippetModalWithSelectedText,
      openDataReferenceAtQuestion,
      hasTopBar = true,
      hasEditingSidebar = true,
      resizableBoxProps = {},
      snippetCollections = [],
      resizable,
      setDatasetQuery,
      setNativeEditorSelectedRange,
      forwardedRef,
      runQuery,
      highlightedLineNumbers,
    } = this.props;

    const dragHandle = resizable ? (
      <div className={S.dragHandleContainer}>
        <div className={S.dragHandle} />
      </div>
    ) : null;

    const canSaveSnippets = snippetCollections.some(
      (collection) => collection.can_write,
    );

    return (
      <div
        className={S.queryEditor}
        data-testid="native-query-editor-container"
        ref={forwardedRef}
      >
        {hasTopBar && (
          <NativeQueryEditorTopBar
            isRunnable={this.props.isRunnable}
            isRunning={this.props.isRunning}
            hasParametersList={this.props.hasParametersList}
            isResultDirty={this.props.isResultDirty}
            isShowingDataReference={this.props.isShowingDataReference}
            onOpenModal={this.props.onOpenModal}
            isShowingTemplateTagsEditor={this.props.isShowingTemplateTagsEditor}
            toggleDataReference={this.props.toggleDataReference}
            toggleSnippetSidebar={this.props.toggleSnippetSidebar}
            toggleTemplateTagsEditor={this.props.toggleTemplateTagsEditor}
            setIsNativeEditorOpen={this.props.setIsNativeEditorOpen}
            snippets={this.props.snippets}
            nativeEditorSelectedText={this.props.nativeEditorSelectedText}
            editorContext={this.props.editorContext}
            onSetDatabaseId={this.props.onSetDatabaseId}
            canChangeDatabase={this.props.canChangeDatabase}
            onChange={this.onChange}
            focus={this.focus}
            hasEditingSidebar={hasEditingSidebar}
            question={question}
            query={query}
            isShowingSnippetSidebar={this.props.isShowingSnippetSidebar}
            isNativeEditorOpen={this.props.isNativeEditorOpen}
            sidebarFeatures={this.props.sidebarFeatures}
            toggleEditor={this.props.toggleEditor}
            setParameterValueToDefault={this.props.setParameterValueToDefault}
            setParameterValue={this.props.setParameterValue}
            setDatasetQuery={this.props.setDatasetQuery}
          />
        )}
        <ResizableBox
          ref={this.resizeBox}
          height={this.state.initialHeight}
          className={cx(S.resizableBox, isNativeEditorOpen && S.open)}
          minConstraints={[Infinity, getEditorLineHeight(MIN_HEIGHT_LINES)]}
          axis="y"
          handle={dragHandle}
          resizeHandles={["s"]}
          {...resizableBoxProps}
          onResizeStop={(e, data) => {
            this.props.handleResize();
            if (typeof resizableBoxProps?.onResizeStop === "function") {
              resizableBoxProps.onResizeStop(e, data);
            }
          }}
        >
          <>
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
            />

            {hasEditingSidebar && !readOnly && (
              <NativeQueryEditorRunButton
                cancelQuery={this.props.cancelQuery}
                isResultDirty={this.props.isResultDirty}
                isRunnable={this.props.isRunnable}
                isRunning={this.props.isRunning}
                nativeEditorSelectedText={this.props.nativeEditorSelectedText}
                runQuery={this.props.runQuery}
              />
            )}
          </>
        </ResizableBox>

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
