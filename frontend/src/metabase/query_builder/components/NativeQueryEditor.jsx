/*global ace*/
/* eslint "react/prop-types": "warn" */

import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import "./NativeQueryEditor.css";

import { ResizableBox } from 'react-resizable';
import { countLines } from "metabase/lib/string";

import 'ace/ace';
import 'ace/ext-language_tools';

import 'ace/mode-sql';
import 'ace/mode-mysql';
import 'ace/mode-pgsql';
import 'ace/mode-sqlserver';
import 'ace/mode-json';

import 'ace/snippets/sql';
import 'ace/snippets/mysql';
import 'ace/snippets/pgsql';
import 'ace/snippets/sqlserver';
import 'ace/snippets/json';

import { getEngineNativeAceMode, getEngineNativeType, getEngineNativeRequiresTable } from "metabase/lib/engine";

import { SQLBehaviour } from "metabase/lib/ace/sql_behaviour";

import _ from "underscore";
import { assocIn } from "icepick";

import DataSelector from './DataSelector.jsx';
import Icon from "metabase/components/Icon.jsx";
import Parameters from "metabase/parameters/components/Parameters";

// This should return an object with information about the mode the ACE Editor should use to edit the query.
// This object should have 2 properties:
// *  `mode` :         the ACE Editor mode name, e.g. 'ace/mode/json'
// *  `description`:   name used to describe the text written in that mode, e.g. 'JSON'. Used to fill in the blank in 'This question is written in _______'.
// *  `requiresTable`: whether the DB selector should be a DB + Table selector. Mongo needs both DB + Table.
function getModeInfo(datasetQuery, databases) {
    let databaseID = datasetQuery ? datasetQuery.database : null,
        database   = _.findWhere(databases, { id: databaseID }),
        engine     = database ? database.engine : null;

    return {
        mode: getEngineNativeAceMode(engine),
        description: getEngineNativeType(engine).toUpperCase(),
        requiresTable: getEngineNativeRequiresTable(engine),
        database: database
    };
}

const SCROLL_MARGIN = 8;
const LINE_HEIGHT = 16;

const MIN_HEIGHT_LINES = 1;
const MAX_AUTO_SIZE_LINES = 12;

const getEditorLineHeight = (lines) => lines * LINE_HEIGHT + 2 * SCROLL_MARGIN;

export default class NativeQueryEditor extends Component {
    constructor(props, context) {
        super(props, context);

        const lines = props.datasetQuery.native.query ?
            Math.min(MAX_AUTO_SIZE_LINES, countLines(props.datasetQuery.native.query)) :
            MAX_AUTO_SIZE_LINES;

        this.state = {
            showEditor: !(props.card && props.card.id),
            modeInfo: getModeInfo(props.datasetQuery, props.databases),
            initialHeight: getEditorLineHeight(lines)
        };

        this.localUpdate = false;

        _.bindAll(this, 'toggleEditor', 'setDatabaseID', 'setTableID');

        // Ace sometimes fires mutliple "change" events in rapid succession
        // e.x. https://github.com/metabase/metabase/issues/2801
        this.onChange = _.debounce(this.onChange.bind(this), 1);
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        databases: PropTypes.array.isRequired,
        nativeDatabases: PropTypes.array.isRequired,
        datasetQuery: PropTypes.object.isRequired,
        setDatasetQuery: PropTypes.func.isRequired,
        runQuery: PropTypes.func.isRequired,
        setDatabaseFn: PropTypes.func.isRequired,
        autocompleteResultsFn: PropTypes.func.isRequired,
        isOpen: PropTypes.bool,
        parameters: PropTypes.array.isRequired,
        setParameterValue: PropTypes.func,
        location: PropTypes.object.isRequired,
        isRunnable: PropTypes.bool.isRequired,
    };

    static defaultProps = {
        isOpen: false
    }

    componentDidMount() {
        this.loadAceEditor();
        document.addEventListener("keydown", this.handleKeyDown);
    }

    componentWillReceiveProps(nextProps) {
        if (this.props.datasetQuery.database !== nextProps.datasetQuery.database) {
            this.setState({
                modeInfo: getModeInfo(nextProps.datasetQuery, nextProps.databases)
            });
        }
    }

    componentDidUpdate() {
        const { modeInfo } = this.state;

        if (this._editor.getValue() !== this.props.datasetQuery.native.query) {
            // This is a weird hack, but the purpose is to avoid an infinite loop caused by the fact that calling editor.setValue()
            // will trigger the editor 'change' event, update the query, and cause another rendering loop which we don't want, so
            // we need a way to update the editor without causing the onChange event to go through as well
            this.localUpdate = true;
            this._editor.setValue(this.props.datasetQuery.native.query);
            this._editor.clearSelection();
            this.localUpdate = false;
        }

        if (modeInfo) {
            let editorElement = ReactDOM.findDOMNode(this.refs.editor);
            if (!modeInfo.database || modeInfo.database.native_permissions !== "write") {
                this._editor.setReadOnly(true);
                editorElement.classList.add("read-only");
            } else {
                this._editor.setReadOnly(false);
                editorElement.classList.remove("read-only");

            }
            if (this._editor.getSession().$modeId !== modeInfo.mode) {
                this._editor.getSession().setMode(modeInfo.mode);
                // monkey patch the mode to add our bracket/paren/braces-matching behavior
                if (this.state.modeInfo.mode.indexOf("sql") >= 0) {
                    this._editor.getSession().$mode.$behaviour = new SQLBehaviour();
                }
            }
        }
    }

    componentWillUnmount() {
        document.removeEventListener("keydown", this.handleKeyDown);
    }

    handleKeyDown = (e) => {
        const ENTER_KEY = 13;
        if (e.keyCode === ENTER_KEY && (e.metaKey || e.ctrlKey) && this.props.isRunnable) {
            const { card } = this.props;
            if (e.altKey) {
                // run just the selected text, if any
                const selectedText = this._editor.getSelectedText();
                if (selectedText) {
                    const temporaryCard = assocIn(card, ["dataset_query", "native", "query"], selectedText);
                    this.props.runQuery(temporaryCard, { shouldUpdateUrl: false });
                }
            } else {
                this.props.runQuery();
            }
        }
    }

    loadAceEditor() {
        let editorElement = ReactDOM.findDOMNode(this.refs.editor);
        this._editor = ace.edit(editorElement);

        // listen to onChange events
        this._editor.getSession().on('change', this.onChange);

        // initialize the content
        const querySource = this.props.datasetQuery.native.query;
        this._editor.setValue(querySource);

        this._editor.renderer.setScrollMargin(SCROLL_MARGIN, SCROLL_MARGIN);

        // clear the editor selection, otherwise we start with the whole editor selected
        this._editor.clearSelection();

        // hmmm, this could be dangerous
        this._editor.focus();

        let aceLanguageTools = ace.require('ace/ext/language_tools');
        this._editor.setOptions({
            enableBasicAutocompletion: true,
            enableSnippets: true,
            enableLiveAutocompletion: true,
            showPrintMargin: false,
            highlightActiveLine: false,
            highlightGutterLine: false,
            showLineNumbers: true
        });

        aceLanguageTools.addCompleter({
            getCompletions: async (editor, session, pos, prefix, callback) => {
                if (prefix.length < 2) {
                    callback(null, []);
                    return;
                }
                try {
                    // HACK: call this.props.autocompleteResultsFn rathern than caching the prop since it might change
                    let results = await this.props.autocompleteResultsFn(prefix);
                    // transform results of the API call into what ACE expects
                    let js_results = results.map(function(result) {
                        return {
                            name: result[0],
                            value: result[0],
                            meta: result[1]
                        };
                    });
                    callback(null, js_results);
                } catch (error) {
                    console.log('error getting autocompletion data', error);
                    callback(null, []);
                }
            }
        });
    }

    _updateSize() {
         const doc = this._editor.getSession().getDocument();
         const element = ReactDOM.findDOMNode(this.refs.resizeBox);
         const newHeight = getEditorLineHeight(doc.getLength());
         if (newHeight > element.offsetHeight && newHeight <= getEditorLineHeight(MAX_AUTO_SIZE_LINES)) {
             element.style.height = newHeight + "px";
             this._editor.resize();
         }
     }

    onChange(event) {
        if (this._editor && !this.localUpdate) {
            this._updateSize();
            const { datasetQuery } = this.props;
            if (datasetQuery.native.query !== this._editor.getValue()) {
                this.props.setDatasetQuery(assocIn(datasetQuery, ["native", "query"], this._editor.getValue()));
            }
        }
    }

    toggleEditor() {
        this.setState({ showEditor: !this.state.showEditor })
    }

    /// Change the Database we're currently editing a query for.
    setDatabaseID(databaseID) {
        this.props.setDatabaseFn(databaseID);
    }

    setTableID(tableID) {
        // translate the table id into the table name
        let database = this.props.databases ? _.findWhere(this.props.databases, { id: this.props.datasetQuery.database }) : null,
            table = database ? _.findWhere(database.tables, { id: tableID }) : null;

        if (table) {
            const { datasetQuery } = this.props;
            if (datasetQuery.native.collection !== table.name) {
                this.props.setDatasetQuery(assocIn(datasetQuery, ["native", "collection"], table.name));
            }
        }
    }

    render() {
        const { parameters, setParameterValue, location } = this.props;

        let modeInfo = getModeInfo(this.props.datasetQuery, this.props.databases);

        let dataSelectors = [];
        if (this.state.showEditor && this.props.nativeDatabases) {
            // we only render a db selector if there are actually multiple to choose from
            if (this.props.nativeDatabases.length > 1 && (this.props.datasetQuery.database === null || _.any(this.props.nativeDatabases, (db) => db.id === this.props.datasetQuery.database))) {
                dataSelectors.push(
                    <div key="db_selector" className="GuiBuilder-section GuiBuilder-data flex align-center">
                        <span className="GuiBuilder-section-label Query-label">Database</span>
                        <DataSelector
                            databases={this.props.nativeDatabases}
                            datasetQuery={this.props.datasetQuery}
                            setDatabaseFn={this.setDatabaseID}
                        />
                    </div>
                )
            } else if (modeInfo.database) {
                dataSelectors.push(
                    <span key="db" className="p2 text-bold text-grey">{modeInfo.database.name}</span>
                );
            }
            if (modeInfo.requiresTable) {
                let databases = this.props.nativeDatabases,
                    dbId      = this.props.datasetQuery.database,
                    database  = databases ? _.findWhere(databases, { id: dbId }) : null,
                    tables    = database ? database.tables : [],
                    selectedTable = this.props.datasetQuery.native.collection ? _.findWhere(tables, { name: this.props.datasetQuery.native.collection }) : null;

                dataSelectors.push(
                    <div key="table_selector" className="GuiBuilder-section GuiBuilder-data flex align-center">
                        <span className="GuiBuilder-section-label Query-label">Table</span>
                        <DataSelector
                            ref="dataSection"
                            includeTables={true}
                            datasetQuery={{
                                type: "query",
                                query: { source_table: selectedTable ? selectedTable.id : null },
                                database: dbId
                            }}
                            databases={[database]}
                            tables={tables}
                            setDatabaseFn={this.setDatabaseID}
                            setSourceTableFn={this.setTableID}
                            isInitiallyOpen={false}
                        />
                    </div>
                );
            }
        } else {
            dataSelectors = <span className="p2 text-grey-4">{'This question is written in ' + modeInfo.description + '.'}</span>;
        }

        let editorClasses, toggleEditorText, toggleEditorIcon;
        const hasWritePermission = modeInfo.database && modeInfo.database.native_permissions === "write";
        if (this.state.showEditor) {
            editorClasses = "";
            toggleEditorText = hasWritePermission ? "Hide Editor" : "Hide Query";
            toggleEditorIcon = "contract";
        } else {
            editorClasses = "hide";
            toggleEditorText = hasWritePermission ? "Open Editor" : "Show Query";
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
                        <a className="Query-label no-decoration flex-align-right flex align-center px2" onClick={this.toggleEditor}>
                            <span className="mx2">{toggleEditorText}</span>
                            <Icon name={toggleEditorIcon} size={20}/>
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
                        <div id="id_sql" ref="editor"></div>
                    </ResizableBox>
                </div>
            </div>
        );
    }
}
