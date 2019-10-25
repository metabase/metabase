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
import { t } from "ttag";

import { SQLBehaviour } from "metabase/lib/ace/sql_behaviour";

import _ from "underscore";

import Icon from "metabase/components/Icon";

import Parameters from "metabase/parameters/components/Parameters";

const SCROLL_MARGIN = 8;
const LINE_HEIGHT = 16;

const MIN_HEIGHT_LINES = 1;
const MAX_AUTO_SIZE_LINES = 12;

const ICON_SIZE = 18;

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

import DataReferenceButton from "./view/DataReferenceButton";
import NativeVariablesButton from "./view/NativeVariablesButton";

type AutoCompleteResult = [string, string, string];
type AceEditor = any; // TODO;

type Props = {
  location: LocationDescriptor,

  question: Question,
  query: NativeQuery,

  handleResize: () => void,

  runQuestionQuery: (options?: RunQueryParams) => void,
  setDatasetQuery: (datasetQuery: DatasetQuery) => void,

  setParameterValue: (parameterId: ParameterId, value: string) => void,

  autocompleteResultsFn: (input: string) => Promise<AutoCompleteResult[]>,

  isNativeEditorOpen: boolean,
  setIsNativeEditorOpen: (isOpen: boolean) => void,
};
type State = {
  initialHeight: number,
  firstRun: boolean,
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
      initialHeight: getEditorLineHeight(lines),
      firstRun: true,
    };

    // Ace sometimes fires mutliple "change" events in rapid succession
    // e.x. https://github.com/metabase/metabase/issues/2801
    // $FlowFixMe
    this.onChange = _.debounce(this.onChange.bind(this), 1);
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

    const editorElement = ReactDOM.findDOMNode(this.refs.editor);
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

  componentWillReceiveProps(nextProps: Props) {
    if (this.state.firstRun && nextProps.isRunning && !this.props.isRunning) {
      this.setState({ firstRun: false });
      this._updateSize(true);
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
            .setQueryText(selectedText)
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

    const editorElement = ReactDOM.findDOMNode(this.refs.editor);

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

  _updateSize(allowShrink: boolean = false) {
    const doc = this._editor.getSession().getDocument();
    const element = ReactDOM.findDOMNode(this.refs.resizeBox);
    const newHeight = getEditorLineHeight(doc.getLength());
    if (
      (allowShrink || newHeight > element.offsetHeight) &&
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
      setParameterValue,
      location,
      isNativeEditorOpen,
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
    if (isNativeEditorOpen) {
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
            {isNativeEditorOpen &&
              DataReferenceButton.shouldRender(this.props) && (
                <DataReferenceButton {...this.props} size={ICON_SIZE} />
              )}
            {isNativeEditorOpen &&
              NativeVariablesButton.shouldRender(this.props) && (
                <NativeVariablesButton
                  {...this.props}
                  size={ICON_SIZE}
                  className="mx3 flex align-center"
                />
              )}
            <a
              className="Query-label no-decoration flex align-center mx3 text-brand-hover transition-all"
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
          className={"border-top " + editorClasses}
          height={this.state.initialHeight}
          minConstraints={[Infinity, getEditorLineHeight(MIN_HEIGHT_LINES)]}
          axis="y"
          onResizeStop={(e, data) => {
            this.props.handleResize();
            this._editor.resize();
          }}
        >
          <div id="id_sql" ref="editor" />
        </ResizableBox>
      </div>
    );
  }
}
