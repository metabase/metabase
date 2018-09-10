/* @flow */
/*global ace*/

import React, { Component } from "react";
import ReactDOM from "react-dom";

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

import "ace/snippets/sql";
import "ace/snippets/mysql";
import "ace/snippets/pgsql";
import "ace/snippets/sqlserver";
import "ace/snippets/json";
import { t } from "c-3po";

import { SQLBehaviour } from "metabase/lib/ace/sql_behaviour";

import _ from "underscore";

import Icon from "metabase/components/Icon.jsx";
import Parameters from "metabase/parameters/components/Parameters";

const SCROLL_MARGIN = 8;
const LINE_HEIGHT = 16;

const MIN_HEIGHT_LINES = 1;
const MAX_AUTO_SIZE_LINES = 12;

const getEditorLineHeight = lines => lines * LINE_HEIGHT + 2 * SCROLL_MARGIN;

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

type AutoCompleteResult = [string, string, string];
type AceEditor = any; // TODO;

type Props = {
  location: LocationDescriptor,

  question: Question,
  query: NativeQuery,

  runQuestionQuery: (options?: RunQueryParams) => void,
  setDatasetQuery: (datasetQuery: DatasetQuery) => void,

  setDatabaseFn: (databaseId: DatabaseId) => void,
  setParameterValue: (parameterId: ParameterId, value: string) => void,

  autocompleteResultsFn: (input: string) => Promise<AutoCompleteResult[]>,
};
type State = {
  showEditor: boolean,
  initialHeight: number,
};

export default class NativeQueryEditor extends Component {
  props: Props;
  state: State;

  _editor: AceEditor;
  _localUpdate: boolean = false;

  constructor(props: Props) {
    super(props);

    const lines = Math.min(
      MAX_AUTO_SIZE_LINES,
      (props.query && props.query.lineCount()) || MAX_AUTO_SIZE_LINES,
    );

    this.state = {
      showEditor: !props.question || !props.question.isSaved(),
      initialHeight: getEditorLineHeight(lines),
    };

    // Ace sometimes fires mutliple "change" events in rapid succession
    // e.x. https://github.com/metabase/metabase/issues/2801
    // $FlowFixMe
    this.onChange = _.debounce(this.onChange.bind(this), 1);
  }

  static defaultProps = {
    isOpen: false,
  };

  componentDidMount() {
    this.loadAceEditor();
    document.addEventListener("keydown", this.handleKeyDown);
  }

  componentDidUpdate() {
    const { query } = this.props;
    if (!query || !this._editor) {
      return;
    }

    if (this._editor.getValue() !== query.queryText()) {
      // This is a weird hack, but the purpose is to avoid an infinite loop caused by the fact that calling editor.setValue()
      // will trigger the editor 'change' event, update the query, and cause another rendering loop which we don't want, so
      // we need a way to update the editor without causing the onChange event to go through as well
      this._localUpdate = true;
      this._editor.setValue(query.queryText());
      this._editor.clearSelection();
      this._localUpdate = false;
    }

    let editorElement = ReactDOM.findDOMNode(this.refs.editor);
    if (query.hasWritePermission()) {
      this._editor.setReadOnly(false);
      editorElement.classList.remove("read-only");
    } else {
      this._editor.setReadOnly(true);
      editorElement.classList.add("read-only");
    }
    const aceMode = query.aceMode();
    if (this._editor.getSession().$modeId !== aceMode) {
      this._editor.getSession().setMode(aceMode);
      // monkey patch the mode to add our bracket/paren/braces-matching behavior
      if (aceMode.indexOf("sql") >= 0) {
        this._editor.getSession().$mode.$behaviour = new SQLBehaviour();
      }
    }
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  handleKeyDown = (e: KeyboardEvent) => {
    const { query, runQuestionQuery } = this.props;

    const ENTER_KEY = 13;
    if (e.keyCode === ENTER_KEY && (e.metaKey || e.ctrlKey) && query.canRun()) {
      const { query } = this.props;
      if (e.altKey) {
        // run just the selected text, if any
        const selectedText = this._editor.getSelectedText();
        if (selectedText) {
          const temporaryCard = query
            .updateQueryText(selectedText)
            .question()
            .card();
          runQuestionQuery({
            overrideWithCard: temporaryCard,
            shouldUpdateUrl: false,
          });
        }
      } else {
        runQuestionQuery();
      }
    }
  };

  loadAceEditor() {
    const { query } = this.props;

    let editorElement = ReactDOM.findDOMNode(this.refs.editor);

    // $FlowFixMe
    if (typeof ace === "undefined" || !ace || !ace.edit) {
      // fail gracefully-ish if ace isn't available, e.x. in integration tests
      return;
    }

    this._editor = ace.edit(editorElement);

    // listen to onChange events
    this._editor.getSession().on("change", this.onChange);

    // initialize the content
    this._editor.setValue(query ? query.queryText() : "");

    this._editor.renderer.setScrollMargin(SCROLL_MARGIN, SCROLL_MARGIN);

    // clear the editor selection, otherwise we start with the whole editor selected
    this._editor.clearSelection();

    // hmmm, this could be dangerous
    this._editor.focus();

    let aceLanguageTools = ace.require("ace/ext/language_tools");
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
          let results = await this.props.autocompleteResultsFn(prefix);
          // transform results of the API call into what ACE expects
          let js_results = results.map(function(result) {
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
    const newHeight = getEditorLineHeight(doc.getLength());
    if (
      newHeight > element.offsetHeight &&
      newHeight <= getEditorLineHeight(MAX_AUTO_SIZE_LINES)
    ) {
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
          .updateQueryText(this._editor.getValue())
          .update(this.props.setDatasetQuery);
      }
    }
  }

  toggleEditor = () => {
    this.setState({ showEditor: !this.state.showEditor });
  };

  /// Change the Database we're currently editing a query for.
  setDatabaseId = (databaseId: DatabaseId) => {
    // TODO: use metabase-lib
    this.props.setDatabaseFn(databaseId);
  };

  setTableId = (tableId: TableId) => {
    // TODO: push more of this into metabase-lib?
    const { query } = this.props;
    const table = query._metadata.tables[tableId];
    if (table && table.name !== query.collection()) {
      query.updateCollection(table.name).update(this.props.setDatasetQuery);
    }
  };

  render() {
    const { query, setParameterValue, location } = this.props;
    const database = query.database();
    const databases = query.databases();
    const parameters = query.question().parameters();

    let dataSelectors = [];
    if (this.state.showEditor && databases.length > 0) {
      // we only render a db selector if there are actually multiple to choose from
      if (
        databases.length > 1 &&
        (database == null || _.any(databases, db => db.id === database.id))
      ) {
        dataSelectors.push(
          <div
            key="db_selector"
            className="GuiBuilder-section GuiBuilder-data flex align-center"
          >
            <span className="GuiBuilder-section-label Query-label">{t`Database`}</span>
            <DatabaseDataSelector
              databases={databases}
              selectedDatabaseId={database && database.id}
              setDatabaseFn={this.setDatabaseId}
              isInitiallyOpen={database == null}
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
            className="GuiBuilder-section GuiBuilder-data flex align-center"
          >
            <span className="GuiBuilder-section-label Query-label">{t`Table`}</span>
            <SchemaAndTableDataSelector
              selectedTableId={selectedTable ? selectedTable.id : null}
              selectedDatabaseId={database && database.id}
              databases={[database]}
              tables={tables}
              setSourceTableFn={this.setTableId}
              isInitiallyOpen={false}
            />
          </div>,
        );
      }
    } else {
      dataSelectors = (
        <span className="p2 text-medium">{t`This question is written in ${query.nativeQueryLanguage()}.`}</span>
      );
    }

    let editorClasses, toggleEditorText, toggleEditorIcon;
    if (this.state.showEditor) {
      editorClasses = "";
      toggleEditorText = query.hasWritePermission()
        ? t`Hide Editor`
        : t`Hide Query`;
      toggleEditorIcon = "contract";
    } else {
      editorClasses = "hide";
      toggleEditorText = query.hasWritePermission()
        ? t`Open Editor`
        : t`Show Query`;
      toggleEditorIcon = "expand";
    }

    return (
      <div className="wrapper">
        <div className="NativeQueryEditor bordered rounded shadowed">
          <div className="flex align-center" style={{ minHeight: 50 }}>
            {dataSelectors}
            <Parameters
              parameters={parameters}
              query={location.query}
              setParameterValue={setParameterValue}
              syncQueryString
              isQB
              commitImmediately
            />
            <a
              className="Query-label no-decoration flex-align-right flex align-center px2"
              onClick={this.toggleEditor}
            >
              <span className="mx2">{toggleEditorText}</span>
              <Icon name={toggleEditorIcon} size={20} />
            </a>
          </div>
          <ResizableBox
            ref="resizeBox"
            className={"border-top " + editorClasses}
            height={this.state.initialHeight}
            minConstraints={[Infinity, getEditorLineHeight(MIN_HEIGHT_LINES)]}
            axis="y"
            onResizeStop={(e, data) => {
              this._editor.resize();
            }}
          >
            <div id="id_sql" ref="editor" />
          </ResizableBox>
        </div>
      </div>
    );
  }
}
