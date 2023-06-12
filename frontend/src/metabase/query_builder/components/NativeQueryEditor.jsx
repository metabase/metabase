/*global ace*/
/* eslint-disable react/prop-types */
import { t } from "ttag";
import React, { Component } from "react";
import cx from "classnames";
import "ace/ace";
import "ace/ext-language_tools";
import "ace/ext-searchbox";
import "ace/mode-sql";
import "ace/mode-mysql";
import "ace/mode-pgsql";
import "ace/mode-sqlserver";
import "ace/mode-json";
import "ace/snippets/text";
import "ace/snippets/sql";
import "ace/snippets/mysql";
import "ace/snippets/pgsql";
import "ace/snippets/sqlserver";
import "ace/snippets/json";
import _ from "underscore";
import { ResizableBox } from "react-resizable";
import { connect } from "react-redux";
import slugg from "slugg";

import { isEventOverElement } from "metabase/lib/dom";
import { getEngineNativeAceMode } from "metabase/lib/engine";
import { SQLBehaviour } from "metabase/lib/ace/sql_behaviour";
import ExplicitSize from "metabase/components/ExplicitSize";
import Modal from "metabase/components/Modal";

import Databases from "metabase/entities/databases";
import Snippets from "metabase/entities/snippets";
import SnippetCollections from "metabase/entities/snippet-collections";
import SnippetFormModal from "metabase/query_builder/components/template_tags/SnippetFormModal";
import Questions from "metabase/entities/questions";
import { CARD_TAG_REGEX } from "metabase-lib/queries/NativeQuery";
import { ResponsiveParametersList } from "./ResponsiveParametersList";
import NativeQueryEditorSidebar from "./NativeQueryEditor/NativeQueryEditorSidebar";
import VisibilityToggler from "./NativeQueryEditor/VisibilityToggler";
import RightClickPopover from "./NativeQueryEditor/RightClickPopover";
import DataSourceSelectors from "./NativeQueryEditor/DataSourceSelectors";
import {
  ACE_ELEMENT_ID,
  SCROLL_MARGIN,
  MIN_HEIGHT_LINES,
} from "./NativeQueryEditor/constants";
import {
  calcInitialEditorHeight,
  getEditorLineHeight,
  getMaxAutoSizeLines,
} from "./NativeQueryEditor/utils";

import "./NativeQueryEditor.css";
import { NativeQueryEditorRoot } from "./NativeQueryEditor.styled";

const AUTOCOMPLETE_DEBOUNCE_DURATION = 700;
const AUTOCOMPLETE_CACHE_DURATION = AUTOCOMPLETE_DEBOUNCE_DURATION * 1.2; // tolerate 20%

export class NativeQueryEditor extends Component {
  _localUpdate = false;

  constructor(props) {
    super(props);

    const { query, viewHeight } = props;
    this.state = {
      initialHeight: calcInitialEditorHeight({ query, viewHeight }),
      isSelectedTextPopoverOpen: false,
      mobileShowParameterList: false,
    };

    // Ace sometimes fires multiple "change" events in rapid succession
    // e.x. https://github.com/metabase/metabase/issues/2801
    this.onChange = _.debounce(this.onChange.bind(this), 1);

    this.editor = React.createRef();
    this.resizeBox = React.createRef();
  }

  static defaultProps = {
    isOpen: false,
    enableRun: true,
    cancelQueryOnLeave: true,
    resizable: true,
  };

  UNSAFE_componentWillMount() {
    const { question, setIsNativeEditorOpen, isInitiallyOpen } = this.props;

    setIsNativeEditorOpen?.(
      !question || !question.isSaved() || isInitiallyOpen,
    );
  }

  componentDidMount() {
    this.loadAceEditor();
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("contextmenu", this.handleRightClick);
  }

  handleRightClick = event => {
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

  componentDidUpdate(prevProps) {
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
      this._editor.setValue(query.queryText());
      this._editor.clearSelection();
      this._localUpdate = false;
    }

    const editorElement = this.editor.current;

    if (query.hasWritePermission() && !readOnly) {
      this._editor.setReadOnly(false);
      editorElement.classList.remove("read-only");
    } else {
      this._editor.setReadOnly(true);
      editorElement.classList.add("read-only");
    }

    const aceMode = getEngineNativeAceMode(query.engine());
    const session = this._editor.getSession();

    if (session.$modeId !== aceMode) {
      session.setMode(aceMode);
      if (aceMode.indexOf("sql") >= 0) {
        // monkey patch the mode to add our bracket/paren/braces-matching behavior
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

  // this is overwritten when the editor mounts
  nextCompleters = undefined;

  cardTagIdAtCursor = ({ row, column }) => {
    const line = this._editor.getValue().split("\n")[row];
    const matches = Array.from(line.matchAll(CARD_TAG_REGEX));
    const match = matches.find(
      m => column > m.index && column < m.index + m[0].length,
    );
    return parseInt(match?.[2]) || null;
  };

  handleCursorChange = _.debounce((e, { cursor }) => {
    this._editor.completers = this.nextCompleters(cursor);
    if (this.props.setNativeEditorSelectedRange) {
      this.props.setNativeEditorSelectedRange(this._editor.getSelectionRange());
    }
    const cardTagId = this.cardTagIdAtCursor(cursor);
    if (cardTagId) {
      this.props.openDataReferenceAtQuestion(cardTagId);
    }
  }, 100);

  handleKeyDown = e => {
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
    this.props.cancelQuery();
    const { query, runQuestionQuery } = this.props;

    // if any text is selected, just run that
    const selectedText = this._editor?.getSelectedText();

    if (selectedText) {
      const temporaryCard = query.setQueryText(selectedText).question().card();

      runQuestionQuery({
        overrideWithCard: temporaryCard,
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

    this._editor = ace.edit(editorElement);

    // listen to onChange events
    this._editor.getSession().on("change", this.onChange);
    this._editor.getSelection().on("changeCursor", this.handleCursorChange);

    const minLineNumberWidth = 20;
    this._editor.getSession().gutterRenderer = {
      getWidth: (session, lastLineNumber, config) =>
        Math.max(
          minLineNumberWidth,
          lastLineNumber.toString().length * config.characterWidth,
        ),
      getText: (session, row) => row + 1,
    };

    // initialize the content
    this._editor.setValue(query?.queryText() ?? "");

    this._editor.renderer.setScrollMargin(SCROLL_MARGIN, SCROLL_MARGIN);

    // clear the editor selection, otherwise we start with the whole editor selected
    this._editor.clearSelection();

    // hmmm, this could be dangerous
    if (!this.props.readOnly) {
      this._editor.focus();
    }

    const aceLanguageTools = ace.require("ace/ext/language_tools");
    this._editor.setOptions({
      enableBasicAutocompletion: true,
      enableSnippets: false,
      enableLiveAutocompletion: true,
      showPrintMargin: false,
      highlightActiveLine: false,
      highlightGutterLine: false,
      showLineNumbers: true,
    });

    this._lastAutoComplete = { timestamp: 0, prefix: null, results: [] };

    aceLanguageTools.addCompleter({
      getCompletions: async (_editor, _session, _pos, prefix, callback) => {
        if (!this.props.autocompleteResultsFn) {
          return callback(null, []);
        }

        try {
          let { results, timestamp } = this._lastAutoComplete;
          const cacheHit =
            Date.now() - timestamp < AUTOCOMPLETE_CACHE_DURATION &&
            this._lastAutoComplete.prefix === prefix;
          if (!cacheHit) {
            // Get models and fields from tables
            // HACK: call this.props.autocompleteResultsFn rather than caching the prop since it might change
            const apiResults = await this.props.autocompleteResultsFn(prefix);
            this._lastAutoComplete = {
              timestamp: Date.now(),
              prefix,
              results,
            };

            // Get referenced questions
            const referencedQuestionIds =
              this.props.query.referencedQuestionIds();
            // The results of the API call are cached by ID
            const referencedQuestions = await Promise.all(
              referencedQuestionIds.map(id => this.props.fetchQuestion(id)),
            );

            // Get columns from referenced questions that match the prefix
            const lowerCasePrefix = prefix.toLowerCase();
            const isMatchForPrefix = name =>
              name.toLowerCase().includes(lowerCasePrefix);
            const questionColumns = referencedQuestions
              .filter(Boolean)
              .flatMap(question =>
                question.result_metadata
                  .filter(columnMetadata =>
                    isMatchForPrefix(columnMetadata.name),
                  )
                  .map(columnMetadata => [
                    columnMetadata.name,
                    `${question.name} :${columnMetadata.base_type}`,
                  ]),
              );

            // Concat the results from tables, fields, and referenced questions.
            // The ace editor will deduplicate results based on name, keeping results
            // that come first. In case of a name conflict, prioritise referenced
            // questions' columns over tables and fields.
            results = questionColumns.concat(apiResults);
          }

          // transform results into what ACE expects
          const resultsForAce = results.map(([name, meta]) => ({
            name: name,
            value: name,
            meta: meta,
          }));
          callback(null, resultsForAce);
        } catch (error) {
          console.log("error getting autocompletion data", error);
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

  getSnippetNameAtCursor = ({ row, column }) => {
    const lines = this._editor.getValue().split("\n");
    const linePrefix = lines[row].slice(0, column);
    const match = linePrefix.match(/\{\{\s*snippet:\s*([^\}]*)$/);
    return match?.[1] || null;
  };

  getCardTagNameAtCursor = ({ row, column }) => {
    const lines = this._editor.getValue().split("\n");
    const linePrefix = lines[row].slice(0, column);
    const match = linePrefix.match(/\{\{\s*(#[^\}]*)$/);
    return match?.[1] || null;
  };

  getSnippetCompletions = (editor, session, pos, prefix, callback) => {
    const name = this.getSnippetNameAtCursor(pos);
    const snippets = (this.props.snippets || []).filter(snippet =>
      snippet.name.toLowerCase().includes(name.toLowerCase()),
    );

    callback(
      null,
      snippets.map(({ name, description, content }) => ({
        name,
        value: name,
      })),
    );
  };

  getCardTagCompletions = async (editor, session, pos, prefix, callback) => {
    // This ensures the user is only typing the first "word" considered by the autocompleter
    // inside the {{#...}} tag.
    // e.g. if `|` is the cursor position and the user is typing:
    //   - {{#123-foo|}} will fetch completions for the word "123-foo"
    //   - {{#123 foo|}} will not fetch completions because the word "foo" is not the first word in the tag.
    // Note we need to drop the leading `#` from the card tag name because the prefix only includes alphanumerics
    if (prefix !== this.getCardTagNameAtCursor(pos).substring(1)) {
      callback(null, null);
    }
    const apiResults = await this.props.cardAutocompleteResultsFn(prefix);
    const resultsForAce = apiResults.map(
      ({ id, name, dataset, collection_name }) => {
        const collectionName = collection_name || t`Our analytics`;
        return {
          name: `${id}-${slugg(name)}`,
          value: `${id}-${slugg(name)}`,
          meta: dataset
            ? t`Model in ${collectionName}`
            : t`Question in ${collectionName}`,
          score: dataset ? 100000 : 0, // prioritize models above questions
        };
      },
    );
    callback(null, resultsForAce);
  };

  _updateSize() {
    const doc = this._editor.getSession().getDocument();
    const element = this.resizeBox.current;
    // set the newHeight based on the line count, but ensure it's within
    // [MIN_HEIGHT_LINES, getMaxAutoSizeLines()]
    const newHeight = getEditorLineHeight(
      Math.max(
        Math.min(doc.getLength(), getMaxAutoSizeLines()),
        MIN_HEIGHT_LINES,
      ),
    );
    if (newHeight > element.offsetHeight) {
      element.style.height = newHeight + "px";
      this._editor.resize();
    }
  }

  _retriggerAutocomplete = _.debounce(() => {
    if (this._editor.completer?.popup?.isOpen) {
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
    this.props.setIsNativeEditorOpen(!this.props.isNativeEditorOpen);
  };

  /// Change the Database we're currently editing a query for.
  setDatabaseId = databaseId => {
    const { query, setDatasetQuery } = this.props;
    if (query.databaseId() !== databaseId) {
      setDatasetQuery(query.setDatabaseId(databaseId).setDefaultCollection());
      if (this._editor && !this.props.readOnly) {
        // HACK: the cursor doesn't blink without this intended small delay
        setTimeout(() => this._editor.focus(), 50);
      }
    }
  };

  setTableId = tableId => {
    // TODO: push more of this into metabase-lib?
    const { query, setDatasetQuery } = this.props;
    const table = query.metadata().table(tableId);
    if (table?.name !== query.collection()) {
      setDatasetQuery(query.setCollectionName(table.name));
    }
  };

  setParameterIndex = (parameterId, parameterIndex) => {
    const { query, setDatasetQuery } = this.props;
    setDatasetQuery(query.setParameterIndex(parameterId, parameterIndex));
  };

  handleFilterButtonClick = () => {
    this.setState({
      mobileShowParameterList: !this.state.mobileShowParameterList,
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
      hasParametersList = true,
      hasTopBar = true,
      hasEditingSidebar = true,
      resizableBoxProps = {},
      snippetCollections = [],
      resizable,
      editorContext = "question",
      setDatasetQuery,
    } = this.props;

    const parameters = query.question().parameters();

    const dragHandle = resizable ? (
      <div className="NativeQueryEditorDragHandleWrapper">
        <div className="NativeQueryEditorDragHandle" />
      </div>
    ) : null;

    const canSaveSnippets = snippetCollections.some(
      collection => collection.can_write,
    );

    return (
      <NativeQueryEditorRoot
        className="NativeQueryEditor bg-light full"
        data-testid="native-query-editor-container"
      >
        {hasTopBar && (
          <div className="flex align-center" data-testid="native-query-top-bar">
            <div className={!isNativeEditorOpen ? "hide sm-show" : ""}>
              <DataSourceSelectors
                isNativeEditorOpen={isNativeEditorOpen}
                query={query}
                readOnly={readOnly}
                setDatabaseId={this.setDatabaseId}
                setTableId={this.setTableId}
                editorContext={editorContext}
              />
            </div>
            {hasParametersList && (
              <ResponsiveParametersList
                question={question}
                parameters={parameters}
                setParameterValue={setParameterValue}
                setParameterIndex={this.setParameterIndex}
              />
            )}
            {query.hasWritePermission() && this.props.setIsNativeEditorOpen && (
              <VisibilityToggler
                className={!isNativeEditorOpen ? "hide sm-show" : ""}
                isOpen={isNativeEditorOpen}
                readOnly={!!readOnly}
                toggleEditor={this.toggleEditor}
              />
            )}
          </div>
        )}
        <ResizableBox
          ref={this.resizeBox}
          className={cx("border-top flex ", { hide: !isNativeEditorOpen })}
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
            this._editor.resize();
          }}
        >
          <div
            className="flex-full"
            data-testid="native-query-editor"
            id={ACE_ELEMENT_ID}
            ref={this.editor}
          />

          <RightClickPopover
            isOpen={this.state.isSelectedTextPopoverOpen}
            openSnippetModalWithSelectedText={openSnippetModalWithSelectedText}
            runQuery={this.runQuery}
            target={() => this.editor.current.querySelector(".ace_selection")}
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
              {...this.props}
            />
          )}
        </ResizableBox>
      </NativeQueryEditorRoot>
    );
  }
}

const mapDispatchToProps = dispatch => ({
  fetchQuestion: async id => {
    const action = await dispatch(
      Questions.actions.fetch(
        { id },
        { noEvent: true, useCachedForbiddenError: true },
      ),
    );
    return Questions.HACK_getObjectFromAction(action);
  },
});

export default _.compose(
  ExplicitSize(),
  Databases.loadList({ loadingAndErrorWrapper: false }),
  Snippets.loadList({ loadingAndErrorWrapper: false }),
  SnippetCollections.loadList({ loadingAndErrorWrapper: false }),
  connect(null, mapDispatchToProps),
)(NativeQueryEditor);
