import cx from "classnames";
import { memo } from "react";
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
  TableId,
} from "metabase-types/api";

import { ResponsiveParametersList } from "../ResponsiveParametersList";

import {
  CodeMirrorEditor,
  type CodeMirrorEditorProps,
  type CodeMirrorEditorRef,
} from "./CodeMirrorEditor";
import DataSourceSelectors from "./DataSourceSelectors";
import S from "./NativeQueryEditor.module.css";
import type { Features as SidebarFeatures } from "./NativeQueryEditorActionButtons";
import { NativeQueryEditorActionButtons } from "./NativeQueryEditorActionButtons";
import { NativeQueryEditorRunButton } from "./NativeQueryEditorRunButton/NativeQueryEditorRunButton";
import { RightClickPopover } from "./RightClickPopover";
import { VisibilityToggler } from "./VisibilityToggler";
import { MIN_HEIGHT_LINES } from "./constants";
import type { SelectionRange } from "./types";
import {
  calcInitialEditorHeight,
  formatQuery,
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
  isPromptInputVisible: boolean;
  isCollapsed: boolean;
  currentHeight: number;
  isCollapsingWithAnimation: boolean;
  collapseAnimationHeight?: number;
}

interface NativeQueryEditorHeaderProps {
  hasTopBar: boolean;
  canChangeDatabase: boolean;
  isNativeEditorOpen: boolean;
  query: any;
  question: any;
  readOnly: boolean | undefined;
  setDatabaseId: (databaseId: number) => void;
  setTableId: (tableId: number) => void;
  editorContext: string;
  hasParametersList: boolean;
  parameters: any;
  setParameterValue: any;
  setParameterIndex: any;
  setParameterValueToDefault: any;
  sidebarFeatures: any;
  hasEditingSidebar: boolean;
  snippetCollections: any[];
  snippets: any[];
  isRunnable: boolean;
  isRunning: boolean;
  isResultDirty: boolean;
  isShowingDataReference: boolean;
  isShowingTemplateTagsEditor: boolean;
  isShowingSnippetSidebar: boolean;
  onOpenModal: any;
  toggleDataReference: any;
  toggleTemplateTagsEditor: any;
  toggleSnippetSidebar: any;
  nativeEditorSelectedText: string | undefined;
  setIsNativeEditorOpen: any;
  toggleEditor: any;
  readOnlyProp: boolean | undefined;
}

class NativeQueryEditor extends Component<Props, NativeQueryEditorState> {
  resizeBox = createRef<HTMLDivElement & ResizableBox>();
  editor = createRef<CodeMirrorEditorRef>();
  topBar = createRef<HTMLDivElement>();

  collapseThreshold = 150;
  collapseAnimationDuration = 1000; // ms
  defaultExpandedHeight = 200; // px, fallback if no previous height

  constructor(props: Props) {
    super(props);

    const { query, viewHeight } = props;
    const initialHeight = calcInitialEditorHeight({ query, viewHeight });
    this.state = {
      initialHeight,
      isSelectedTextPopoverOpen: false,
      mobileShowParameterList: false,
      isPromptInputVisible: false,
      isCollapsed: false,
      currentHeight: initialHeight,
      isCollapsingWithAnimation: false,
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
    // Restore height when editor is opened via VisibilityToggler
    if (
      prevProps.isNativeEditorOpen === false &&
      this.props.isNativeEditorOpen === true
    ) {
      this.setState(
        {
          isCollapsed: false,
          currentHeight: this.state.initialHeight,
          isCollapsingWithAnimation: false,
        },
        () => {
          if (this.resizeBox.current && this.resizeBox.current.style) {
            this.resizeBox.current.style.height =
              this.state.initialHeight + "px";
          }
        },
      );
    }
  }

  focus() {
    if (this.props.readOnly) {
      return;
    }
    this.editor.current?.focus();
  }

  // Change the Database we're currently editing a query for.
  setDatabaseId = (databaseId: DatabaseId) => {
    const { query, setDatasetQuery, question, onSetDatabaseId } = this.props;

    if (question.databaseId() !== databaseId) {
      setDatasetQuery(query.setDatabaseId(databaseId).setDefaultCollection());

      onSetDatabaseId?.(databaseId);
      this.focus();
    }
  };

  setTableId = (tableId: TableId) => {
    const { query, setDatasetQuery } = this.props;
    const table = query.metadata().table(tableId);
    if (table && table.name !== query.collection()) {
      setDatasetQuery(query.setCollectionName(table.name));
    }
  };

  setParameterIndex = (parameterId: ParameterId, parameterIndex: number) => {
    const { query, setDatasetQuery } = this.props;
    setDatasetQuery(query.setParameterIndex(parameterId, parameterIndex));
  };

  handleFilterButtonClick = () => {
    this.setState({
      mobileShowParameterList: !this.state.mobileShowParameterList,
    });
  };

  togglePromptVisibility = () => {
    this.setState((prev) => ({
      isPromptInputVisible: !prev.isPromptInputVisible,
    }));
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

  formatQuery = async () => {
    const { question } = this.props;
    const query = question.query();
    const engine = Lib.engine(query);
    const queryText = Lib.rawNativeQuery(query);

    if (!engine) {
      // no engine found, do nothing
      return;
    }

    const formattedQuery = await formatQuery(queryText, engine);
    this.onChange(formattedQuery);
    this.focus();
  };

  handleResizeStop = (
    e: React.SyntheticEvent,
    data: { size: { height: number } },
  ) => {
    const { height } = data.size;
    if (height < this.collapseThreshold) {
      requestAnimationFrame(() => {
        const actualHeight = this.resizeBox.current?.offsetHeight || height;
        if (actualHeight <= 500) {
          // Animate collapse
          this.setState(
            {
              isCollapsingWithAnimation: true,
              isCollapsed: false,
              currentHeight: actualHeight,
              collapseAnimationHeight: actualHeight,
            },
            () => {
              if (this.resizeBox.current && this.resizeBox.current.style) {
                this.resizeBox.current.style.height = actualHeight + "px";
                void this.resizeBox.current.offsetHeight;
                this.resizeBox.current.style.height = "0px";
              }
              requestAnimationFrame(() => {
                if (this.resizeBox.current && this.resizeBox.current.style) {
                  this.resizeBox.current.style.height = "1px";
                }
                this.setState({
                  isCollapsed: true,
                  isCollapsingWithAnimation: false,
                  collapseAnimationHeight: 1,
                  currentHeight: 1,
                });
                if (typeof this.props.setUIControls === "function") {
                  this.props.setUIControls({ isNativeEditorOpen: false });
                }
              });
            },
          );
        } else {
          // Collapse immediately
          this.setState({
            isCollapsed: true,
            isCollapsingWithAnimation: false,
            collapseAnimationHeight: 1,
            currentHeight: 1,
          });
          if (typeof this.props.setUIControls === "function") {
            this.props.setUIControls({ isNativeEditorOpen: false });
          }
        }
      });
    } else {
      this.setState({
        isCollapsed: false,
        currentHeight: height,
        isCollapsingWithAnimation: false,
        collapseAnimationHeight: height,
      });
    }
    this.props.handleResize();
    if (typeof this.props.resizableBoxProps?.onResizeStop === "function") {
      this.props.resizableBoxProps.onResizeStop(e, data);
    }
  };

  handleExpand = () => {
    // Expand to previous or default height
    const expandTo =
      this.state.currentHeight > this.collapseThreshold
        ? this.state.currentHeight
        : this.defaultExpandedHeight;
    this.setState({ isCollapsed: false }, () => {
      if (this.resizeBox.current) {
        this.resizeBox.current.style.height = expandTo + "px";
      }
    });
  };

  render() {
    const {
      question,
      query,
      setParameterValue,
      readOnly,
      isNativeEditorOpen,
      openSnippetModalWithSelectedText,
      openDataReferenceAtQuestion,
      hasParametersList = true,
      hasTopBar = true,
      hasEditingSidebar = true,
      resizableBoxProps = {},
      snippetCollections = [],
      resizable,
      editorContext = "question",
      setDatasetQuery,
      setNativeEditorSelectedRange,
      sidebarFeatures,
      canChangeDatabase,
      setParameterValueToDefault,
      forwardedRef,
      runQuery,
      highlightedLineNumbers,
    } = this.props;

    const parameters = query.question().parameters();

    const dragHandle = resizable ? (
      <div className={S.dragHandleContainer}>
        <div className={S.dragHandle} />
      </div>
    ) : null;

    return (
      <div
        className={S.queryEditor}
        data-testid="native-query-editor-container"
        ref={forwardedRef}
      >
        {hasTopBar && (
          <NativeQueryEditorHeader
            hasTopBar={hasTopBar}
            canChangeDatabase={canChangeDatabase}
            isNativeEditorOpen={isNativeEditorOpen}
            query={query}
            question={question}
            readOnly={readOnly}
            setDatabaseId={this.setDatabaseId}
            setTableId={this.setTableId}
            editorContext={editorContext}
            hasParametersList={hasParametersList}
            parameters={parameters}
            setParameterValue={setParameterValue}
            setParameterIndex={this.setParameterIndex}
            setParameterValueToDefault={setParameterValueToDefault}
            sidebarFeatures={sidebarFeatures}
            hasEditingSidebar={hasEditingSidebar}
            snippetCollections={snippetCollections}
            snippets={this.props.snippets}
            isRunnable={this.props.isRunnable}
            isRunning={this.props.isRunning}
            isResultDirty={this.props.isResultDirty}
            isShowingDataReference={this.props.isShowingDataReference}
            isShowingTemplateTagsEditor={this.props.isShowingTemplateTagsEditor}
            isShowingSnippetSidebar={this.props.isShowingSnippetSidebar}
            onOpenModal={this.props.onOpenModal}
            toggleDataReference={this.props.toggleDataReference}
            toggleTemplateTagsEditor={this.props.toggleTemplateTagsEditor}
            toggleSnippetSidebar={this.props.toggleSnippetSidebar}
            nativeEditorSelectedText={this.props.nativeEditorSelectedText}
            setIsNativeEditorOpen={this.props.setIsNativeEditorOpen}
            toggleEditor={this.props.toggleEditor}
            readOnlyProp={readOnly}
          />
        )}
        <ResizableBox
          ref={this.resizeBox}
          height={
            this.state.isCollapsingWithAnimation
              ? this.state.collapseAnimationHeight || this.state.currentHeight
              : this.state.isCollapsed
                ? 1
                : this.state.currentHeight
          }
          className={cx(
            S.resizableBox,
            isNativeEditorOpen && S.open,
            this.state.isCollapsed && S.collapsed,
            this.state.isCollapsingWithAnimation && S.collapsing,
          )}
          minConstraints={[Infinity, getEditorLineHeight(MIN_HEIGHT_LINES)]}
          maxConstraints={[Infinity, this.props.viewHeight]}
          axis="y"
          handle={dragHandle}
          resizeHandles={["s"]}
          {...resizableBoxProps}
          onResizeStop={this.handleResizeStop}
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
                disappear={this.state.isCollapsed}
              />
            )}
          </>
        </ResizableBox>

        <RightClickPopover
          isOpen={this.state.isSelectedTextPopoverOpen}
          openSnippetModalWithSelectedText={openSnippetModalWithSelectedText}
          runQuery={runQuery}
          target={() => this.editor.current?.getSelectionTarget()}
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

// Header component to avoid unnecessary re-renders
const NativeQueryEditorHeader = memo(function NativeQueryEditorHeader(
  props: NativeQueryEditorHeaderProps,
): JSX.Element | null {
  const {
    hasTopBar,
    canChangeDatabase,
    isNativeEditorOpen,
    query,
    question,
    readOnly,
    setDatabaseId,
    setTableId,
    editorContext,
    hasParametersList,
    parameters,
    setParameterValue,
    setParameterIndex,
    setParameterValueToDefault,
    sidebarFeatures,
    hasEditingSidebar,
    snippetCollections,
    snippets,
    isRunnable,
    isRunning,
    isResultDirty,
    isShowingDataReference,
    isShowingTemplateTagsEditor,
    isShowingSnippetSidebar,
    onOpenModal,
    toggleDataReference,
    toggleTemplateTagsEditor,
    toggleSnippetSidebar,
    nativeEditorSelectedText,
    setIsNativeEditorOpen,
    toggleEditor,
    readOnlyProp,
  } = props;
  if (!hasTopBar) {
    return null;
  }

  return (
    <Flex align="flex-start" data-testid="native-query-top-bar">
      {canChangeDatabase && (
        <DataSourceSelectors
          isNativeEditorOpen={isNativeEditorOpen}
          query={query}
          question={question}
          readOnly={readOnly}
          setDatabaseId={setDatabaseId}
          setTableId={setTableId}
          editorContext={editorContext}
        />
      )}
      {hasParametersList && (
        <ResponsiveParametersList
          question={question}
          parameters={parameters}
          setParameterValue={setParameterValue}
          setParameterIndex={setParameterIndex}
          setParameterValueToDefault={setParameterValueToDefault}
          enableParameterRequiredBehavior
        />
      )}
      <Flex ml="auto" gap="lg" mr="lg" align="center" h="55px">
        {isNativeEditorOpen && hasEditingSidebar && !readOnly && (
          <NativeQueryEditorActionButtons
            features={sidebarFeatures}
            onShowPromptInput={toggleTemplateTagsEditor}
            onFormatQuery={() => {}}
            onGenerateQuery={() => {}}
            question={question}
            nativeEditorSelectedText={nativeEditorSelectedText}
            snippetCollections={snippetCollections}
            snippets={snippets}
            isRunnable={isRunnable}
            isRunning={isRunning}
            isResultDirty={isResultDirty}
            isShowingDataReference={isShowingDataReference}
            isShowingTemplateTagsEditor={isShowingTemplateTagsEditor}
            isShowingSnippetSidebar={isShowingSnippetSidebar}
            onOpenModal={onOpenModal}
            toggleDataReference={toggleDataReference}
            toggleTemplateTagsEditor={toggleTemplateTagsEditor}
            toggleSnippetSidebar={toggleSnippetSidebar}
          />
        )}
        {query.hasWritePermission() &&
          !query.question().isArchived() &&
          setIsNativeEditorOpen && (
            <VisibilityToggler
              isOpen={isNativeEditorOpen}
              isCollapsed={false}
              readOnly={!!readOnlyProp}
              toggleEditor={toggleEditor}
            />
          )}
      </Flex>
    </Flex>
  );
});

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
