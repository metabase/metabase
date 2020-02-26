/* @flow */
/*global ace*/

import React, { Component } from "react";
import ReactDOM from "react-dom";
import cx from "classnames";

import "./NativeQueryEditor.css";

// $FlowFixMe react-resizable causes Flow errors
import { ResizableBox } from "react-resizable";

import "ace/ace";
import "ace/ext-language_tools";

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
import { t } from "ttag";

import { isMac } from "metabase/lib/browser";
import { delay } from "metabase/lib/promise";
import { SQLBehaviour } from "metabase/lib/ace/sql_behaviour";

import _ from "underscore";

import Icon from "metabase/components/Icon";
import ExplicitSize from "metabase/components/ExplicitSize";

import Parameters from "metabase/parameters/components/Parameters";

const SCROLL_MARGIN = 8;
const LINE_HEIGHT = 16;

const MIN_HEIGHT_LINES = 10;

const ICON_SIZE = 18;

const getEditorLineHeight = lines => lines * LINE_HEIGHT + 2 * SCROLL_MARGIN;
const getLinesForHeight = height => (height - 2 * SCROLL_MARGIN) / LINE_HEIGHT;

import Question from "metabase-lib/lib/Question";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

import type { DatasetQuery } from "metabase/meta/types/Card";
import type { DatabaseId } from "metabase/meta/types/Database";
import type { TableId } from "metabase/meta/types/Table";
import type { ParameterId } from "metabase/meta/types/Parameter";
import type { LocationDescriptor } from "metabase/meta/types";
import type { RunQueryParams } from "metabase/query_builder/actions";
import {
  DatabaseDataSelector,
  SchemaAndTableDataSelector,
} from "metabase/query_builder/components/DataSelector";

import RunButtonWithTooltip from "./RunButtonWithTooltip";
import DataReferenceButton from "./view/DataReferenceButton";
import NativeVariablesButton from "./view/NativeVariablesButton";

type AutoCompleteResult = [string, string, string];
type AceEditor = any; // TODO;

type Props = {
  readOnly?: boolean,

  location: LocationDescriptor,

  question: Question,
  query: NativeQuery,

  handleResize: () => void,

  runQuestionQuery: (options?: RunQueryParams) => void,
  setDatasetQuery: (datasetQuery: DatasetQuery) => void,
  cancelQuery: () => void,

  setParameterValue: (parameterId: ParameterId, value: string) => void,

  autocompleteResultsFn: (input: string) => Promise<AutoCompleteResult[]>,

  isNativeEditorOpen: boolean,
  setIsNativeEditorOpen: (isOpen: boolean) => void,

  isRunnable: boolean,
  isRunning: boolean,
  isResultDirty: boolean,
  isPreviewing: boolean,
  isNativeEditorOpen: boolean,

  viewHeight: number,
  width: number,
};
type State = {
  initialHeight: number,
  hasTextSelected: boolean,
};

@ExplicitSize()
export default class NativeQueryEditor extends Component {
  props: Props;
  state: State;

  _editor: AceEditor;
  _localUpdate: boolean = false;

  constructor(props: Props) {
    super(props);

    const lines = Math.max(
      Math.min(
        this.maxAutoSizeLines(),
        (props.query && props.query.lineCount()) || this.maxAutoSizeLines(),
      ),
      MIN_HEIGHT_LINES,
    );

    this.state = {
      initialHeight: getEditorLineHeight(lines),
      hasTextSelected: false,
    };

    // Ace sometimes fires mutliple "change" events in rapid succession
    // e.x. https://github.com/metabase/metabase/issues/2801
    // $FlowFixMe
    this.onChange = _.debounce(this.onChange.bind(this), 1);
  }

  maxAutoSizeLines() {
    // This determines the max height that the editor *automatically* takes.
    // - On load, long queries will be capped at this length
    // - When loading an empty query, this is the height
    // - When the editor grows during typing this is the max height
    const FRACTION_OF_TOTAL_VIEW_HEIGHT = 0.4;
    const pixelHeight = this.props.viewHeight * FRACTION_OF_TOTAL_VIEW_HEIGHT;
    return Math.ceil(getLinesForHeight(pixelHeight));
  }

  static defaultProps = {
    isOpen: false,
  };

  componentWillMount() {
    const { question, setIsNativeEditorOpen } = this.props;
    setIsNativeEditorOpen(!question || !question.isSaved());
  }

  componentDidMount() {
    this.loadAceEditor();
    document.addEventListener("keydown", this.handleKeyDown);
  }

  componentDidUpdate(prevProps: Props) {
    const { query } = this.props;
    if (!query || !this._editor) {
      return;
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

    const editorElement = ReactDOM.findDOMNode(this.refs.editor);
    if (query.hasWritePermission()) {
      this._editor.setReadOnly(false);
      editorElement.classList.remove("read-only");
    } else {
      this._editor.setReadOnly(true);
      editorElement.classList.add("read-only");
    }
    const aceMode = query.aceMode();
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
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  // Debouncing this avoids race condition between checking the current version
  // of state and asynchronously setting state. We could pass a function to
  // setState, but then we'd risk calling setState too much as this event is
  // triggered multiple times per user-perceived selection.
  handleSelectionChange = _.debounce(() => {
    const hasTextSelected = Boolean(this._editor.getSelectedText());
    if (this.state.hasTextSelected !== hasTextSelected) {
      this.setState({ hasTextSelected });
    }
  }, 100);

  handleKeyDown = (e: KeyboardEvent) => {
    const ENTER_KEY = 13;
    if (e.keyCode === ENTER_KEY && (e.metaKey || e.ctrlKey)) {
      this.runQuery();
    }
  };

  runQuery = () => {
    const { query, runQuestionQuery } = this.props;

    // if any text is selected, just run that
    const selectedText = this._editor && this._editor.getSelectedText();
    if (selectedText) {
      const temporaryCard = query
        .setQueryText(selectedText)
        .question()
        .card();
      runQuestionQuery({
        overrideWithCard: temporaryCard,
        shouldUpdateUrl: false,
      });
    } else if (query.canRun()) {
      // $FlowFixMe
      runQuestionQuery()
        // <hack>
        // This is an attempt to fix a conflict between Ace and react-draggable.
        // TableInteractive uses react-draggable for the column headers. When
        // that's first added (as a result of runninga query), Ace freezes until
        // the arrow keys are hit or text is deleted.
        // Bluring and refocusing gets it out of that state. Here we try and
        // wait until just after a table is added. That's super error prone, but
        // we're just doing a best effort to eliminate the freezing.
        .then(() => delay(1500))
        .then(() => {
          this._editor.blur();
          this._editor.focus();
        });
      // </hack>
    }
  };

  loadAceEditor() {
    const { query } = this.props;

    const editorElement = ReactDOM.findDOMNode(this.refs.editor);

    // $FlowFixMe
    if (typeof ace === "undefined" || !ace || !ace.edit) {
      // fail gracefully-ish if ace isn't available, e.x. in integration tests
      return;
    }

    this._editor = ace.edit(editorElement);

    // listen to onChange events
    this._editor.getSession().on("change", this.onChange);
    this._editor.on("changeSelection", this.handleSelectionChange);

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
    this._editor.setValue(query ? query.queryText() : "");

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
      enableSnippets: true,
      enableLiveAutocompletion: true,
      showPrintMargin: false,
      highlightActiveLine: false,
      highlightGutterLine: false,
      showLineNumbers: true,
    });

    aceLanguageTools.addCompleter({
      getCompletions: async (editor, session, pos, prefix, callback) => {
        try {
          // HACK: call this.props.autocompleteResultsFn rather than caching the prop since it might change
          const results = await this.props.autocompleteResultsFn(prefix);
          // transform results of the API call into what ACE expects
          const js_results = results.map(function(result) {
            return {
              name: result[0],
              value: result[0],
              meta: result[1],
            };
          });
          callback(null, js_results);
        } catch (error) {
          console.log("error getting autocompletion data", error);
          callback(null, []);
        }
      },
    });
  }

  _updateSize() {
    const doc = this._editor.getSession().getDocument();
    const element = ReactDOM.findDOMNode(this.refs.resizeBox);
    // set the newHeight based on the line count, but ensure it's within
    // [MIN_HEIGHT_LINES, this.maxAutoSizeLines()]
    const newHeight = getEditorLineHeight(
      Math.max(
        Math.min(doc.getLength(), this.maxAutoSizeLines()),
        MIN_HEIGHT_LINES,
      ),
    );
    if (newHeight > element.offsetHeight) {
      element.style.height = newHeight + "px";
      this._editor.resize();
    }
  }

  onChange() {
    const { query } = this.props;
    if (this._editor && !this._localUpdate) {
      this._updateSize();
      if (query.queryText() !== this._editor.getValue()) {
        query
          .setQueryText(this._editor.getValue())
          .update(this.props.setDatasetQuery);
      }
    }
  }

  toggleEditor = () => {
    this.props.setIsNativeEditorOpen(!this.props.isNativeEditorOpen);
  };

  /// Change the Database we're currently editing a query for.
  setDatabaseId = (databaseId: DatabaseId) => {
    const { query } = this.props;
    if (query.databaseId() !== databaseId) {
      query
        .setDatabaseId(databaseId)
        .setDefaultCollection()
        .update(this.props.setDatasetQuery);
    }
  };

  setTableId = (tableId: TableId) => {
    // TODO: push more of this into metabase-lib?
    const { query } = this.props;
    const table = query.metadata().table(tableId);
    if (table && table.name !== query.collection()) {
      query.setCollectionName(table.name).update(this.props.setDatasetQuery);
    }
  };

  setParameterIndex = (parameterId: ParameterId, parameterIndex: number) => {
    const { query, setDatasetQuery } = this.props;
    query
      .setParameterIndex(parameterId, parameterIndex)
      .update(setDatasetQuery);
  };

  render() {
    const {
      query,
      cancelQuery,
      setParameterValue,
      location,
      readOnly,
      isNativeEditorOpen,
      isRunnable,
      isRunning,
      isResultDirty,
      isPreviewing,
    } = this.props;

    const database = query.database();
    const databases = query.databases();
    const parameters = query.question().parameters();

    let dataSelectors = [];
    if (isNativeEditorOpen && databases.length > 0) {
      // we only render a db selector if there are actually multiple to choose from
      if (
        database == null ||
        (databases.length > 1 && databases.some(db => db.id === database.id))
      ) {
        dataSelectors.push(
          <div
            key="db_selector"
            className="GuiBuilder-section GuiBuilder-data flex align-center ml2"
          >
            <DatabaseDataSelector
              databases={databases}
              selectedDatabaseId={database && database.id}
              setDatabaseFn={this.setDatabaseId}
              isInitiallyOpen={database == null}
              readOnly={this.props.readOnly}
            />
          </div>,
        );
      } else if (database) {
        dataSelectors.push(
          <span key="db" className="p2 text-bold text-grey">
            {database.name}
          </span>,
        );
      }
      if (query.requiresTable()) {
        const selectedTable = query.table();
        const tables = query.tables() || [];

        dataSelectors.push(
          <div
            key="table_selector"
            className="GuiBuilder-section GuiBuilder-data flex align-center ml2"
          >
            <SchemaAndTableDataSelector
              selectedTableId={selectedTable ? selectedTable.id : null}
              selectedDatabaseId={database && database.id}
              databases={[database]}
              tables={tables}
              setSourceTableFn={this.setTableId}
              isInitiallyOpen={false}
              readOnly={this.props.readOnly}
            />
          </div>,
        );
      }
    } else {
      dataSelectors = (
        <span className="p2 text-medium">{t`This question is written in ${query.nativeQueryLanguage()}.`}</span>
      );
    }

    let toggleEditorText, toggleEditorIcon;
    if (isNativeEditorOpen) {
      toggleEditorText = null;
      toggleEditorIcon = "contract";
    } else {
      toggleEditorText = query.hasWritePermission()
        ? t`Open Editor`
        : t`Show Query`;
      toggleEditorIcon = "expand";
    }
    const dragHandle = (
      <div className="NativeQueryEditorDragHandleWrapper">
        <div className="NativeQueryEditorDragHandle" />
      </div>
    );

    return (
      <div className="NativeQueryEditor bg-light full">
        <div className="flex align-center" style={{ minHeight: 55 }}>
          {dataSelectors}
          <Parameters
            parameters={parameters}
            query={location.query}
            setParameterValue={setParameterValue}
            setParameterIndex={this.setParameterIndex}
            syncQueryString
            isEditing
            isQB
            commitImmediately
          />
          <div className="flex-align-right flex align-center text-medium pr1">
            <a
              className={cx(
                "Query-label no-decoration flex align-center mx3 text-brand-hover transition-all",
                { hide: readOnly },
              )}
              onClick={this.toggleEditor}
            >
              <span className="mr1" style={{ minWidth: 70 }}>
                {toggleEditorText}
              </span>
              <Icon name={toggleEditorIcon} size={18} />
            </a>
          </div>
        </div>
        <ResizableBox
          ref="resizeBox"
          className={cx("border-top flex ", { hide: !isNativeEditorOpen })}
          height={this.state.initialHeight}
          minConstraints={[Infinity, getEditorLineHeight(MIN_HEIGHT_LINES)]}
          axis="y"
          handle={dragHandle}
          onResizeStop={(e, data) => {
            this.props.handleResize();
            this._editor.resize();
          }}
          resizeHandles={["s"]}
        >
          <div className="flex-full" id="id_sql" ref="editor" />
          <div className="flex flex-column align-center border-left">
            <DataReferenceButton
              {...this.props}
              size={ICON_SIZE}
              className="mt3"
            />
            <NativeVariablesButton
              {...this.props}
              size={ICON_SIZE}
              className="mt3"
            />
            <RunButtonWithTooltip
              disabled={!isRunnable}
              isRunning={isRunning}
              isDirty={isResultDirty}
              isPreviewing={isPreviewing}
              onRun={this.runQuery}
              onCancel={() => cancelQuery()}
              compact
              className="mx2 mb2 mt-auto p2"
              getTooltip={() =>
                (this.state.hasTextSelected
                  ? t`Run selected text`
                  : t`Run query`) +
                " " +
                (isMac() ? t`(⌘ + enter)` : t`(Ctrl + enter)`)
              }
            />
          </div>
        </ResizableBox>
      </div>
    );
  }
}
