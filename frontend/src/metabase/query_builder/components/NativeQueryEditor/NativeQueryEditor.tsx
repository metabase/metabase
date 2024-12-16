import cx from "classnames";
import { Component, createRef } from "react";
import { ResizableBox, type ResizableBoxProps } from "react-resizable";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";
import Modal from "metabase/components/Modal";
import Databases from "metabase/entities/databases";
import SnippetCollections from "metabase/entities/snippet-collections";
import Snippets from "metabase/entities/snippets";
import SnippetFormModal from "metabase/query_builder/components/template_tags/SnippetFormModal";
import type { QueryModalType } from "metabase/query_builder/constants";
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

import DataSourceSelectors from "./DataSourceSelectors";
import { Editor, type EditorProps, type EditorRef } from "./Editor";
import S from "./NativeQueryEditor.module.css";
import type { Features as SidebarFeatures } from "./NativeQueryEditorSidebar";
import { NativeQueryEditorSidebar } from "./NativeQueryEditorSidebar";
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
  enableRun?: boolean;
  canChangeDatabase?: boolean;
  hasTopBar?: boolean;
  hasParametersList?: boolean;
  hasEditingSidebar?: boolean;
  sidebarFeatures?: SidebarFeatures;
  resizable?: boolean;
  resizableBoxProps?: Partial<Omit<ResizableBoxProps, "axis">>;

  editorContext?: "question";

  handleResize: () => void;
  setDatasetQuery: (query: NativeQuery) => Promise<Question>;
  runQuestionQuery: (opts?: {
    overrideWithQuestion?: Question;
    shouldUpdateUrl?: boolean;
  }) => void;
  setNativeEditorSelectedRange: (range: SelectionRange) => void;
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

type Props = OwnProps & ExplicitSizeProps & EntityLoaderProps & EditorProps;

interface NativeQueryEditorState {
  initialHeight: number;
  isSelectedTextPopoverOpen: boolean;
  mobileShowParameterList: boolean;
  isPromptInputVisible: boolean;
}

export class NativeQueryEditor extends Component<
  Props,
  NativeQueryEditorState
> {
  resizeBox = createRef<HTMLDivElement & ResizableBox>();
  editor = createRef<EditorRef>();

  constructor(props: Props) {
    super(props);

    const { query, viewHeight } = props;
    this.state = {
      initialHeight: calcInitialEditorHeight({ query, viewHeight }),
      isSelectedTextPopoverOpen: false,
      mobileShowParameterList: false,
      isPromptInputVisible: false,
    };
  }

  static defaultProps = {
    isOpen: false,
    enableRun: true,
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

  componentDidMount() {
    document.addEventListener("keydown", this.handleKeyDown);
    this.focus();
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

  componentWillUnmount() {
    document.removeEventListener("keydown", this.handleKeyDown);
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
  }

  handleKeyDown = (e: KeyboardEvent) => {
    const { isRunning, cancelQuery, enableRun } = this.props;

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      if (isRunning && cancelQuery) {
        cancelQuery();
      } else if (enableRun) {
        this.runQuery();
      }
    }
  };

  runQuery = () => {
    this.props.cancelQuery?.();
    const { query, runQuestionQuery } = this.props;

    // if any text is selected, just run that
    const selectedText = this.props.nativeEditorSelectedText;

    if (selectedText) {
      const temporaryQuestion = query.setQueryText(selectedText).question();

      runQuestionQuery({
        overrideWithQuestion: temporaryQuestion,
        shouldUpdateUrl: false,
      });
    } else if (query.canRun()) {
      runQuestionQuery();
    }
  };

  focus() {
    if (this.props.readOnly) {
      return;
    }
    this.editor.current?.focus();
  }

  toggleEditor = () => {
    this.props.setIsNativeEditorOpen?.(!this.props.isNativeEditorOpen);
  };

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
    this.setState(prev => ({
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
      this.editor.current?.resize();
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

    const formattedQuery = await formatQuery(queryText, engine);
    this.onChange(formattedQuery);
    this.focus();
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
    } = this.props;

    const parameters = query.question().parameters();

    const dragHandle = resizable ? (
      <div className={S.dragHandleContainer}>
        <div className={S.dragHandle} />
      </div>
    ) : null;

    const canSaveSnippets = snippetCollections.some(
      collection => collection.can_write,
    );

    return (
      <div
        className={S.queryEditor}
        data-testid="native-query-editor-container"
      >
        {hasTopBar && (
          <Flex align="center" data-testid="native-query-top-bar">
            {canChangeDatabase && (
              <DataSourceSelectors
                isNativeEditorOpen={isNativeEditorOpen}
                query={query}
                question={question}
                readOnly={readOnly}
                setDatabaseId={this.setDatabaseId}
                setTableId={this.setTableId}
                editorContext={editorContext}
              />
            )}
            {hasParametersList && (
              <ResponsiveParametersList
                question={question}
                parameters={parameters}
                setParameterValue={setParameterValue}
                setParameterIndex={this.setParameterIndex}
                setParameterValueToDefault={setParameterValueToDefault}
                enableParameterRequiredBehavior
              />
            )}
            {query.hasWritePermission() &&
              !query.question().isArchived() &&
              this.props.setIsNativeEditorOpen && (
                <VisibilityToggler
                  isOpen={isNativeEditorOpen}
                  readOnly={!!readOnly}
                  toggleEditor={this.toggleEditor}
                />
              )}
          </Flex>
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
            this.editor.current?.resize();
          }}
        >
          <>
            <Editor
              ref={this.editor}
              query={query}
              readOnly={readOnly}
              onChange={this.onChange}
              onSelectionChange={setNativeEditorSelectedRange}
              onCursorMoveOverCardTag={openDataReferenceAtQuestion}
              onRightClickSelection={this.handleRightClickSelection}
            />

            {hasEditingSidebar && !readOnly && (
              <NativeQueryEditorSidebar
                runQuery={this.runQuery}
                features={sidebarFeatures}
                onShowPromptInput={this.togglePromptVisibility}
                onFormatQuery={this.formatQuery}
                {...this.props}
              />
            )}
          </>
        </ResizableBox>

        <RightClickPopover
          isOpen={this.state.isSelectedTextPopoverOpen}
          openSnippetModalWithSelectedText={openSnippetModalWithSelectedText}
          runQuery={this.runQuery}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  ExplicitSize(),
  Databases.loadList({ loadingAndErrorWrapper: false }),
  Snippets.loadList({ loadingAndErrorWrapper: false }),
  SnippetCollections.loadList({ loadingAndErrorWrapper: false }),
)(NativeQueryEditor);
