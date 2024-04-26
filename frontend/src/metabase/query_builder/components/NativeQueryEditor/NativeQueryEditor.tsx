import type { Ace } from "ace-builds";
import * as ace from "ace-builds/src-noconflict/ace";
import { createRef, Component } from "react";
import { connect } from "react-redux";
import type { ResizableBox, ResizableBoxProps } from "react-resizable";
import slugg from "slugg";
import { t } from "ttag";
import _ from "underscore";

import "ace/ace";
import "ace/ext-language_tools";
import "ace/ext-searchbox";
import "ace/mode-sql";
import "ace/mode-json";
import "ace/snippets/text";
import "ace/snippets/sql";
import "ace/snippets/json";

import ExplicitSize from "metabase/components/ExplicitSize";
import Modal from "metabase/components/Modal";
import Databases from "metabase/entities/databases";
import Questions from "metabase/entities/questions";
import SnippetCollections from "metabase/entities/snippet-collections";
import Snippets from "metabase/entities/snippets";
import { SQLBehaviour } from "metabase/lib/ace/sql_behaviour";
import { isEventOverElement } from "metabase/lib/dom";
import { getEngineNativeAceMode } from "metabase/lib/engine";
import { checkNotNull } from "metabase/lib/types";
import { canGenerateQueriesForDatabase } from "metabase/metabot/utils";
import SnippetFormModal from "metabase/query_builder/components/template_tags/SnippetFormModal";
import { getSetting } from "metabase/selectors/settings";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import { CARD_TAG_REGEX } from "metabase-lib/v1/queries/NativeQuery";
import type {
  Card,
  CardId,
  Collection,
  DatabaseId,
  NativeQuerySnippet,
  ParameterId,
  TableId,
} from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";

import { ResponsiveParametersList } from "../ResponsiveParametersList";

import DataSourceSelectors from "./DataSourceSelectors";
import {
  DragHandleContainer,
  DragHandle,
  EditorRoot,
  NativeQueryEditorRoot,
  StyledResizableBox,
} from "./NativeQueryEditor.styled";
import NativeQueryEditorPrompt from "./NativeQueryEditorPrompt";
import type { Features as SidebarFeatures } from "./NativeQueryEditorSidebar";
import { NativeQueryEditorSidebar } from "./NativeQueryEditorSidebar";
import { RightClickPopover } from "./RightClickPopover";
import { VisibilityToggler } from "./VisibilityToggler";
import { ACE_ELEMENT_ID, SCROLL_MARGIN, MIN_HEIGHT_LINES } from "./constants";
import {
  calcInitialEditorHeight,
  formatQuery,
  getAutocompleteResultMeta,
  getEditorLineHeight,
  getMaxAutoSizeLines,
} from "./utils";

const AUTOCOMPLETE_DEBOUNCE_DURATION = 700;
const AUTOCOMPLETE_CACHE_DURATION = AUTOCOMPLETE_DEBOUNCE_DURATION * 1.2; // tolerate 20%

type CardCompletionItem = Pick<Card, "id" | "name" | "type"> & {
  collection_name: string;
};

type AutocompleteItem = [string, string];

type LastAutoComplete = {
  timestamp: number;
  prefix: string | null;
  results: AutocompleteItem[];
};

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
  cancelQueryOnLeave?: boolean;
  hasTopBar?: boolean;
  hasParametersList?: boolean;
  hasEditingSidebar?: boolean;
  sidebarFeatures?: SidebarFeatures;
  resizable?: boolean;
  resizableBoxProps?: Partial<Omit<ResizableBoxProps, "axis">>;

  editorContext?: "question";

  handleResize: () => void;
  autocompleteResultsFn: (prefix: string) => Promise<AutocompleteItem[]>;
  cardAutocompleteResultsFn: (prefix: string) => Promise<CardCompletionItem[]>;
  setDatasetQuery: (query: NativeQuery) => Promise<Question>;
  runQuestionQuery: (opts?: {
    overrideWithQuestion?: Question;
    shouldUpdateUrl?: boolean;
  }) => void;
  setNativeEditorSelectedRange: (range: Ace.Range) => void;
  openDataReferenceAtQuestion: (id: CardId) => void;
  openSnippetModalWithSelectedText: () => void;
  insertSnippet: (snippet: NativeQuerySnippet) => void;
  setIsNativeEditorOpen?: (isOpen: boolean) => void;
  setParameterValue: (parameterId: ParameterId, value: string) => void;
  setParameterValueToDefault: (parameterId: ParameterId) => void;
  onOpenModal: (modalType: string) => void;
  toggleDataReference: () => void;
  toggleTemplateTagsEditor: () => void;
  toggleSnippetSidebar: () => void;
  cancelQuery?: () => void;
  closeSnippetModal: () => void;
  onSetDatabaseId?: (id: DatabaseId) => void;
};

interface StateProps {
  canUsePromptInput: boolean;
}

interface DispatchProps {
  fetchQuestion: (cardId: CardId) => Promise<Card>;
}

interface ExplicitSizeProps {
  width: number;
  height: number;
}

interface EntityLoaderProps {
  snippets?: NativeQuerySnippet[];
  snippetCollections?: Collection[];
}

type Props = OwnProps &
  StateProps &
  DispatchProps &
  ExplicitSizeProps &
  EntityLoaderProps;

interface NativeQueryEditorState {
  initialHeight: number;
  isSelectedTextPopoverOpen: boolean;
  mobileShowParameterList: boolean;
  isPromptInputVisible: boolean;
}

type AceCompletionsGetter = Ace.Completer["getCompletions"];

export class NativeQueryEditor extends Component<
  Props,
  NativeQueryEditorState
> {
  editor = createRef<HTMLDivElement>();
  resizeBox = createRef<HTMLDivElement & ResizableBox>();

  // this is overwritten when the editor mounts
  nextCompleters?: (position: Ace.Position) => Ace.Completer[] = undefined;

  _editor: Ace.Editor | null = null;
  _localUpdate = false;

  constructor(props: Props) {
    super(props);

    const { query, viewHeight } = props;
    this.state = {
      initialHeight: calcInitialEditorHeight({ query, viewHeight }),
      isSelectedTextPopoverOpen: false,
      mobileShowParameterList: false,
      isPromptInputVisible: false,
    };

    // Ace sometimes fires multiple "change" events in rapid succession
    // e.x. https://github.com/metabase/metabase/issues/2801
    this.onChange = _.debounce(this.onChange.bind(this), 1);
  }

  static defaultProps = {
    isOpen: false,
    enableRun: true,
    cancelQueryOnLeave: true,
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
    this.loadAceEditor();
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("contextmenu", this.handleRightClick);
  }

  handleRightClick = (event: MouseEvent) => {
    // Ace creates multiple selection elements which collectively cover the selected area.
    const selections = Array.from(document.querySelectorAll(".ace_selection"));

    if (
      this.props.nativeEditorSelectedText &&
      // For some reason the click doesn't target the selection element directly.
      // We check if it falls in the selections bounding rectangle to know if the selected text was clicked.
      selections.some(selection => isEventOverElement(event, selection))
    ) {
      event.preventDefault();
      this.setState({ isSelectedTextPopoverOpen: true });
    }
  };

  componentDidUpdate(prevProps: Props) {
    const { query, readOnly } = this.props;
    if (!query || !this._editor) {
      return;
    }

    if (
      this.state.isSelectedTextPopoverOpen &&
      !this.props.nativeEditorSelectedText &&
      prevProps.nativeEditorSelectedText
    ) {
      // close selected text popover if text is deselected
      this.setState({ isSelectedTextPopoverOpen: false });
    }
    // Check that the query prop changed before updating the editor. Otherwise,
    // we might overwrite just typed characters before onChange is called.
    const queryPropUpdated = this.props.query !== prevProps.query;
    if (queryPropUpdated && this._editor.getValue() !== query.queryText()) {
      // This is a weird hack, but the purpose is to avoid an infinite loop caused by the fact that calling editor.setValue()
      // will trigger the editor 'change' event, update the query, and cause another rendering loop which we don't want, so
      // we need a way to update the editor without causing the onChange event to go through as well
      this._localUpdate = true;
      this.handleQueryUpdate(query.queryText());
      this._localUpdate = false;
    }

    const editorElement = this.editor.current;

    if (query.hasWritePermission() && !readOnly) {
      this._editor.setReadOnly(false);
      editorElement?.classList.remove("read-only");
    } else {
      this._editor.setReadOnly(true);
      editorElement?.classList.add("read-only");
    }

    const aceMode = getEngineNativeAceMode(query.engine());
    const session = this._editor.getSession();

    if (session.$modeId !== aceMode) {
      session.setMode(aceMode);
      if (aceMode.indexOf("sql") >= 0) {
        // monkey patch the mode to add our bracket/paren/braces-matching behavior
        // @ts-expect-error — SQLBehaviour isn't a class
        session.$mode.$behaviour = new SQLBehaviour();

        // add highlighting rule for template tags
        session.$mode.$highlightRules.$rules.start.unshift({
          token: "templateTag",
          regex: "{{[^}]*}}",
          onMatch: null,
        });
        session.$mode.$tokenizer = null;
        session.bgTokenizer.setTokenizer(session.$mode.getTokenizer());
        session.bgTokenizer.start(0);
      }
    }

    if (this.props.width !== prevProps.width && this._editor) {
      this._editor.resize();
    }
  }

  componentWillUnmount() {
    if (this.props.cancelQueryOnLeave) {
      this.props.cancelQuery?.();
    }
    this._editor?.destroy?.();
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("contextmenu", this.handleRightClick);
  }

  cardTagIdAtCursor = ({ row, column }: Ace.Position) => {
    if (!this._editor) {
      return null;
    }
    const line = this._editor.getValue().split("\n")[row];
    const matches = Array.from(line.matchAll(CARD_TAG_REGEX));

    const match = matches.find(
      m =>
        typeof m.index === "number" &&
        column > m.index &&
        column < m.index + m[0].length,
    );
    const idStr = match?.[2];

    return (idStr && parseInt(idStr, 10)) || null;
  };

  handleCursorChange = _.debounce(
    (e: Event, { cursor }: { cursor: Ace.Position }) => {
      if (this._editor && this.nextCompleters) {
        this._editor.completers = this.nextCompleters(cursor);
      }

      if (this._editor && this.props.setNativeEditorSelectedRange) {
        this.props.setNativeEditorSelectedRange(
          this._editor.getSelectionRange(),
        );
      }

      const cardTagId = this.cardTagIdAtCursor(cursor);
      if (cardTagId) {
        this.props.openDataReferenceAtQuestion(cardTagId);
      }
    },
    100,
  );

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
    const selectedText = this._editor?.getSelectedText();

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

  loadAceEditor() {
    const { query } = this.props;

    const editorElement = this.editor.current;

    if (typeof ace === "undefined" || !ace || !ace.edit) {
      // fail gracefully-ish if ace isn't available, e.x. in integration tests
      return;
    }

    const editor = checkNotNull<Ace.Editor>(ace.edit(editorElement));
    this._editor = editor;

    // listen to onChange events
    editor.getSession().on("change", this.onChange);
    editor.getSelection().on("changeCursor", this.handleCursorChange);

    const minLineNumberWidth = 20;
    editor.getSession().gutterRenderer = {
      getWidth: (session, lastLineNumber, config) =>
        Math.max(
          minLineNumberWidth,
          lastLineNumber.toString().length * config.characterWidth,
        ),
      getText: (session, row) => row + 1,
    };

    // initialize the content
    this.handleQueryUpdate(query?.queryText() ?? "");
    editor.renderer.setScrollMargin(SCROLL_MARGIN, SCROLL_MARGIN, 0, 0);

    // reset undo manager to prevent undoing to empty editor
    editor.getSession().getUndoManager().reset();

    // hmmm, this could be dangerous
    if (!this.props.readOnly) {
      editor.focus();
    }

    const aceLanguageTools = ace.require("ace/ext/language_tools");
    editor.setOptions({
      enableBasicAutocompletion: true,
      enableSnippets: false,
      enableLiveAutocompletion: true,
      showPrintMargin: false,
      highlightActiveLine: false,
      highlightGutterLine: false,
      showLineNumbers: true,
    });

    let lastAutoComplete: LastAutoComplete = {
      timestamp: 0,
      prefix: "",
      results: [],
    };

    const prepareResultsForAce = (results: [string, string][]) =>
      results.map(([name, meta]) => ({
        name: name,
        value: name,
        meta: meta,
      }));

    aceLanguageTools.addCompleter({
      getCompletions: async (
        _editor: Ace.Editor,
        _session: Ace.EditSession,
        _pos: Ace.Position,
        prefix: string,
        callback: Ace.CompleterCallback,
      ) => {
        if (!this.props.autocompleteResultsFn) {
          return callback(null, []);
        }

        try {
          if (prefix.length <= 1 && prefix !== lastAutoComplete.prefix) {
            // ACE triggers an autocomplete immediately when the user starts typing that is
            // not debounced by debouncing _retriggerAutocomplete.
            // Here we prevent it from actually calling the autocomplete endpoint.
            // It will run eventually even if the prefix is only one character,
            // after the user stops typing, because _retriggerAutocomplete will get called with the same prefix.
            lastAutoComplete = {
              timestamp: 0,
              prefix,
              results: lastAutoComplete.results,
            };

            callback(null, prepareResultsForAce(lastAutoComplete.results));
            return;
          }

          let { results, timestamp } = lastAutoComplete;
          const cacheHit =
            Date.now() - timestamp < AUTOCOMPLETE_CACHE_DURATION &&
            lastAutoComplete.prefix === prefix;

          if (!cacheHit) {
            // Get models and fields from tables
            // HACK: call this.props.autocompleteResultsFn rather than caching the prop since it might change
            const apiResults = await this.props.autocompleteResultsFn(prefix);
            lastAutoComplete = {
              timestamp: Date.now(),
              prefix,
              results: apiResults,
            };

            // Get referenced questions
            const referencedQuestionIds =
              this.props.query.referencedQuestionIds();
            // The results of the API call are cached by ID
            const referencedCards = await Promise.all(
              referencedQuestionIds.map(id => this.props.fetchQuestion(id)),
            );

            // Get columns from referenced questions that match the prefix
            const lowerCasePrefix = prefix.toLowerCase();
            const isMatchForPrefix = (name: string) =>
              name.toLowerCase().includes(lowerCasePrefix);
            const questionColumns: AutocompleteItem[] = referencedCards
              .filter(Boolean)
              .flatMap(card =>
                card.result_metadata
                  .filter(columnMetadata =>
                    isMatchForPrefix(columnMetadata.name),
                  )
                  .map(
                    columnMetadata =>
                      [
                        columnMetadata.name,
                        `${card.name} :${columnMetadata.base_type}`,
                      ] as AutocompleteItem,
                  ),
              );

            // Concat the results from tables, fields, and referenced questions.
            // The ace editor will deduplicate results based on name, keeping results
            // that come first. In case of a name conflict, prioritise referenced
            // questions' columns over tables and fields.
            results = questionColumns.concat(apiResults);
          }

          // transform results into what ACE expects
          callback(null, prepareResultsForAce(results));
        } catch (error) {
          console.error("error getting autocompletion data", error);
          callback(null, []);
        }
      },
    });

    // the completers when the editor mounts are the standard ones
    const standardCompleters = [...this._editor.completers];

    this.nextCompleters = pos => {
      if (this.getSnippetNameAtCursor(pos)) {
        return [{ getCompletions: this.getSnippetCompletions }];
      } else if (this.getCardTagNameAtCursor(pos)) {
        return [{ getCompletions: this.getCardTagCompletions }];
      } else {
        return standardCompleters;
      }
    };
  }

  getSnippetNameAtCursor = ({ row, column }: Ace.Position) => {
    if (!this._editor) {
      return null;
    }
    const lines = this._editor.getValue().split("\n");
    const linePrefix = lines[row].slice(0, column);
    const match = linePrefix.match(/\{\{\s*snippet:\s*([^\}]*)$/);
    return match?.[1] || null;
  };

  getCardTagNameAtCursor = ({ row, column }: Ace.Position) => {
    if (!this._editor) {
      return null;
    }
    const lines = this._editor.getValue().split("\n");
    const linePrefix = lines[row].slice(0, column);
    const match = linePrefix.match(/\{\{\s*(#[^\}]*)$/);
    return match?.[1] || null;
  };

  getSnippetCompletions: AceCompletionsGetter = (
    editor,
    session,
    pos,
    prefix,
    callback,
  ) => {
    const name = this.getSnippetNameAtCursor(pos);

    if (!name) {
      callback(null, []);
      return;
    }

    const snippets = (this.props.snippets || []).filter(snippet =>
      snippet.name.toLowerCase().includes(name.toLowerCase()),
    );

    callback(
      null,
      snippets.map(({ name }) => ({
        name,
        value: name,
      })),
    );
  };

  getCardTagCompletions: AceCompletionsGetter = async (
    editor,
    session,
    pos,
    prefix,
    callback,
  ) => {
    // This ensures the user is only typing the first "word" considered by the autocompleter
    // inside the {{#...}} tag.
    // e.g. if `|` is the cursor position and the user is typing:
    //   - {{#123-foo|}} will fetch completions for the word "123-foo"
    //   - {{#123 foo|}} will not fetch completions because the word "foo" is not the first word in the tag.
    // Note we need to drop the leading `#` from the card tag name because the prefix only includes alphanumerics
    const tagNameAtCursor = this.getCardTagNameAtCursor(pos);
    if (prefix !== tagNameAtCursor?.substring?.(1)) {
      callback(null, []);
    }
    const apiResults = await this.props.cardAutocompleteResultsFn(prefix);

    const resultsForAce = apiResults.map(
      ({ id, name, type, collection_name }) => {
        const collectionName = collection_name || t`Our analytics`;
        return {
          name: `${id}-${slugg(name)}`,
          value: `${id}-${slugg(name)}`,
          meta: getAutocompleteResultMeta(type, collectionName),
          score: type === "model" ? 100000 : 0, // prioritize models above questions
        };
      },
    );
    callback(null, resultsForAce);
  };

  _updateSize() {
    const { viewHeight } = this.props;

    const doc = this._editor?.getSession().getDocument();
    const element = this.resizeBox.current;

    if (!doc || !element) {
      return;
    }

    const newHeight = getEditorLineHeight(
      Math.max(
        Math.min(doc.getLength(), getMaxAutoSizeLines(viewHeight)),
        MIN_HEIGHT_LINES,
      ),
    );

    if (newHeight > element.offsetHeight) {
      element.style.height = `${newHeight}px`;
      this._editor?.resize();
    }
  }

  _retriggerAutocomplete = _.debounce(() => {
    if (this._editor?.completer?.popup?.isOpen) {
      this._editor.execCommand("startAutocomplete");
    }
  }, AUTOCOMPLETE_DEBOUNCE_DURATION);

  onChange() {
    const { query, setDatasetQuery } = this.props;
    if (this._editor && !this._localUpdate) {
      this._updateSize();
      if (query.queryText() !== this._editor.getValue()) {
        setDatasetQuery(
          query
            .setQueryText(this._editor.getValue())
            .updateSnippetsWithIds(this.props.snippets),
        );
      }
    }

    this._retriggerAutocomplete();
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
      if (!this.props.readOnly) {
        // HACK: the cursor doesn't blink without this intended small delay
        setTimeout(() => this._editor?.focus(), 50);
      }
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

  handleQueryUpdate = (queryText: string) => {
    this._editor?.setValue(queryText);
    this._editor?.clearSelection();
  };

  handleQueryGenerated = (queryText: string) => {
    this.handleQueryUpdate(queryText);
    this._editor?.focus();
  };

  isPromptInputVisible = () => {
    const { canUsePromptInput, isNativeEditorOpen, question } = this.props;
    const database = question.database();
    const isSupported =
      database != null && canGenerateQueriesForDatabase(database);

    return (
      isNativeEditorOpen &&
      isSupported &&
      canUsePromptInput &&
      this.state.isPromptInputVisible
    );
  };

  formatQuery = async () => {
    const { question } = this.props;
    const query = question.query();
    const engine = Lib.engine(query);
    const queryText = Lib.rawNativeQuery(query);

    this.handleQueryUpdate(await formatQuery(queryText, engine));
    this._editor?.focus();
  };

  render() {
    const {
      question,
      query,
      setParameterValue,
      readOnly,
      isNativeEditorOpen,
      openSnippetModalWithSelectedText,
      hasParametersList = true,
      hasTopBar = true,
      hasEditingSidebar = true,
      resizableBoxProps = {},
      snippetCollections = [],
      resizable,
      editorContext = "question",
      setDatasetQuery,
      sidebarFeatures,
      canChangeDatabase,
      setParameterValueToDefault,
    } = this.props;

    const isPromptInputVisible = this.isPromptInputVisible();

    const parameters = query.question().parameters();

    const dragHandle = resizable ? (
      <DragHandleContainer>
        <DragHandle />
      </DragHandleContainer>
    ) : null;

    const canSaveSnippets = snippetCollections.some(
      collection => collection.can_write,
    );

    return (
      <NativeQueryEditorRoot data-testid="native-query-editor-container">
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
            {query.hasWritePermission() && this.props.setIsNativeEditorOpen && (
              <VisibilityToggler
                isOpen={isNativeEditorOpen}
                readOnly={!!readOnly}
                toggleEditor={this.toggleEditor}
              />
            )}
          </Flex>
        )}
        {isPromptInputVisible && (
          <NativeQueryEditorPrompt
            databaseId={question.databaseId()}
            onQueryGenerated={this.handleQueryGenerated}
            onClose={this.togglePromptVisibility}
          />
        )}
        <StyledResizableBox
          ref={this.resizeBox}
          isOpen={isNativeEditorOpen}
          height={this.state.initialHeight}
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
            this._editor?.resize();
          }}
        >
          <>
            <EditorRoot
              id={ACE_ELEMENT_ID}
              data-testid="native-query-editor"
              ref={this.editor}
            />

            <RightClickPopover
              isOpen={this.state.isSelectedTextPopoverOpen}
              openSnippetModalWithSelectedText={
                openSnippetModalWithSelectedText
              }
              runQuery={this.runQuery}
              target={() =>
                this.editor.current?.querySelector(".ace_selection")
              }
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

            {hasEditingSidebar && !readOnly && (
              <NativeQueryEditorSidebar
                runQuery={this.runQuery}
                features={sidebarFeatures}
                onShowPromptInput={this.togglePromptVisibility}
                isPromptInputVisible={isPromptInputVisible}
                onFormatQuery={this.formatQuery}
                {...this.props}
              />
            )}
          </>
        </StyledResizableBox>
      </NativeQueryEditorRoot>
    );
  }
}

const mapStateToProps = (state: State) => ({
  canUsePromptInput: getSetting(state, "is-metabot-enabled"),
});

const mapDispatchToProps = (dispatch: Dispatch) => ({
  fetchQuestion: async (id: CardId) => {
    const action = await dispatch(
      Questions.actions.fetch(
        { id },
        { noEvent: true, useCachedForbiddenError: true },
      ),
    );
    return Questions.HACK_getObjectFromAction(action);
  },
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  ExplicitSize(),
  Databases.loadList({ loadingAndErrorWrapper: false }),
  Snippets.loadList({ loadingAndErrorWrapper: false }),
  SnippetCollections.loadList({ loadingAndErrorWrapper: false }),
  connect(mapStateToProps, mapDispatchToProps),
)(NativeQueryEditor);
