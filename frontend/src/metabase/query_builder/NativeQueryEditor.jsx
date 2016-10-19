/*global ace*/
/* eslint "react/prop-types": "warn" */

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import "./NativeQueryEditor.css";

import { SQLBehaviour } from "metabase/lib/ace/sql_behaviour";

import _ from "underscore";
import { assocIn } from "icepick";

import DataSelector from './DataSelector.jsx';
import Icon from "metabase/components/Icon.jsx";
import ParameterValueWidget from "metabase/dashboard/components/parameters/ParameterValueWidget.jsx";

// This should return an object with information about the mode the ACE Editor should use to edit the query.
// This object should have 2 properties:
// *  `mode` :         the ACE Editor mode name, e.g. 'ace/mode/json'
// *  `description`:   name used to describe the text written in that mode, e.g. 'JSON'. Used to fill in the blank in 'This question is written in _______'.
// *  `requiresTable`: whether the DB selector should be a DB + Table selector. Mongo needs both DB + Table.
function getModeInfo(query, databases) {
    let databaseID = query ? query.database : null,
        database   = _.findWhere(databases, { id: databaseID }),
        engine     = database ? database.engine : null;

    return {
        mode: engine === 'druid' || engine === 'mongo' ? 'ace/mode/json'  :
              engine === 'mysql'                       ? 'ace/mode/mysql' :
              engine === 'postgres'                    ? 'ace/mode/pgsql' :
              engine === 'sqlserver'                   ? 'ace/mode/sqlserver' :
                                                         'ace/mode/sql',
        description: engine === 'druid' || engine === 'mongo' ? 'JSON' : 'SQL',
        requiresTable: engine === 'mongo',
        database: database
    };
}


export default class NativeQueryEditor extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            showEditor: true,//this.props.isOpen,
            modeInfo: getModeInfo(props.query, props.databases)
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
        query: PropTypes.object.isRequired,
        setQueryFn: PropTypes.func.isRequired,
        setDatabaseFn: PropTypes.func.isRequired,
        autocompleteResultsFn: PropTypes.func.isRequired,
        isOpen: PropTypes.bool,
        parameters: PropTypes.array.isRequired,
        parameterValues: PropTypes.object,
        setParameterValue: PropTypes.func
    };

    static defaultProps = {
        isOpen: false
    }

    componentDidMount() {
        this.loadAceEditor();
    }

    componentWillReceiveProps(nextProps) {
        if (this.props.query.database !== nextProps.query.database) {
            this.setState({
                modeInfo: getModeInfo(nextProps.query, nextProps.databases)
            });
        }
    }

    componentDidUpdate() {
        const { modeInfo } = this.state;

        let editorElement = ReactDOM.findDOMNode(this.refs.editor);
        let editor = ace.edit(editorElement);
        if (editor.getValue() !== this.props.query.native.query) {
            // This is a weird hack, but the purpose is to avoid an infinite loop caused by the fact that calling editor.setValue()
            // will trigger the editor 'change' event, update the query, and cause another rendering loop which we don't want, so
            // we need a way to update the editor without causing the onChange event to go through as well
            this.localUpdate = true;
            editor.setValue(this.props.query.native.query);
            editor.clearSelection();
            this.localUpdate = false;
        }

        if (modeInfo) {
            if (modeInfo.database.native_permissions !== "write") {
                editor.setReadOnly(true);
                editorElement.classList.add("read-only");
            } else {
                editor.setReadOnly(false);
                editorElement.classList.remove("read-only");

            }
            if (editor.getSession().$modeId !== modeInfo.mode) {
                editor.getSession().setMode(modeInfo.mode);
                // monkey patch the mode to add our bracket/paren/braces-matching behavior
                if (this.state.modeInfo.mode.indexOf("sql") >= 0) {
                    editor.getSession().$mode.$behaviour = new SQLBehaviour();
                }
            }
        }
    }

    loadAceEditor() {
        let editorElement = ReactDOM.findDOMNode(this.refs.editor);
        let editor = ace.edit(editorElement);

        // listen to onChange events
        editor.getSession().on('change', this.onChange);

        // initialize the content
        editor.setValue(this.props.query.native.query);

        // clear the editor selection, otherwise we start with the whole editor selected
        editor.clearSelection();

        // hmmm, this could be dangerous
        editor.focus();

        this.setState({
            editor: editor
        });

        let aceLanguageTools = ace.require('ace/ext/language_tools');
        editor.setOptions({
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

    onChange(event) {
        if (this.state.editor && !this.localUpdate) {
            const { query } = this.props;
            const { editor } = this.state;
            if (query.native.query !== editor.getValue()) {
                this.props.setQueryFn(assocIn(query, ["native", "query"], editor.getValue()));
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
        let database = this.props.databases ? _.findWhere(this.props.databases, { id: this.props.query.database }) : null,
            table = database ? _.findWhere(database.tables, { id: tableID }) : null;

        if (table) {
            const { query } = this.props;
            if (query.native.collection !== table.name) {
                this.props.setQueryFn(assocIn(query, ["native", "collection"], table.name));
            }
        }
    }

    render() {
        const { parameters, setParameterValue } = this.props;

        let modeInfo = getModeInfo(this.props.query, this.props.databases);

        let dataSelectors = [];
        if (this.state.showEditor && this.props.nativeDatabases) {
            // we only render a db selector if there are actually multiple to choose from
            if (this.props.nativeDatabases.length > 1) {
                dataSelectors.push(
                    <div key="db_selector" className="GuiBuilder-section GuiBuilder-data flex align-center">
                        <span className="GuiBuilder-section-label Query-label">Database</span>
                        <DataSelector
                            databases={this.props.nativeDatabases}
                            query={this.props.query}
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
                    dbId      = this.props.query.database,
                    database  = databases ? _.findWhere(databases, { id: dbId }) : null,
                    tables    = database ? database.tables : [],
                    selectedTable = this.props.query.native.collection ? _.findWhere(tables, { name: this.props.query.native.collection }) : null;

                dataSelectors.push(
                    <div key="table_selector" className="GuiBuilder-section GuiBuilder-data flex align-center">
                        <span className="GuiBuilder-section-label Query-label">Table</span>
                        <DataSelector
                            ref="dataSection"
                            includeTables={true}
                            query={{
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
                        { parameters.map(parameter =>
                            <div key={parameter.id} className="pl2 GuiBuilder-section GuiBuilder-data flex align-center">
                                <span className="GuiBuilder-section-label Query-label">{parameter.name}</span>
                                <ParameterValueWidget
                                    key={parameter.id}
                                    parameter={parameter}
                                    value={parameter.value}
                                    setValue={(v) => setParameterValue(parameter.id, v)}
                                    noReset={parameter.value === parameter.default}
                                    commitImmediately
                                />
                            </div>
                        )}
                        <a className="Query-label no-decoration flex-align-right flex align-center px2" onClick={this.toggleEditor}>
                            <span className="mx2">{toggleEditorText}</span>
                            <Icon name={toggleEditorIcon} size={20}/>
                        </a>
                    </div>
                    <div className={"border-top " + editorClasses}>
                        <div id="id_sql" ref="editor"></div>
                    </div>
                </div>
            </div>
        );
    }
}
