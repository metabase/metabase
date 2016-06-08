/*global ace*/

import React, { Component, PropTypes } from "react";

import _ from "underscore";

import DataSelector from './DataSelector.jsx';
import Icon from "metabase/components/Icon.jsx";

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
        requiresTable: engine === 'mongo'
    };
}


export default class NativeQueryEditor extends Component {
    constructor(props, context) {
        super(props, context);

        this.localUpdate = false;

        _.bindAll(this, 'onChange', 'toggleEditor', 'setDatabaseID', 'setTableID');
    }

    static propTypes = {
        databases: PropTypes.array.isRequired,
        query: PropTypes.object.isRequired,
        setQueryFn: PropTypes.func.isRequired,
        setDatabaseFn: PropTypes.func.isRequired,
        autocompleteResultsFn: PropTypes.func.isRequired,
        isOpen: PropTypes.bool
    };

    static defaultProps = {
        isOpen: false
    }

    componentWillMount() {
        this.setState({
            showEditor: this.props.isOpen,
            modeInfo: getModeInfo(this.props.query, this.props.databases)
        });
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
        var editor = ace.edit("id_sql");
        if (editor.getValue() !== this.props.query.native.query) {
            // This is a weird hack, but the purpose is to avoid an infinite loop caused by the fact that calling editor.setValue()
            // will trigger the editor 'change' event, update the query, and cause another rendering loop which we don't want, so
            // we need a way to update the editor without causing the onChange event to go through as well
            this.localUpdate = true;
            editor.setValue(this.props.query.native.query);
            editor.clearSelection();
            this.localUpdate = false;
        }

        if (this.state.modeInfo && editor.getSession().$modeId !== this.state.modeInfo.mode) {
            console.log('Setting ACE Editor mode to:', this.state.modeInfo.mode);
            editor.getSession().setMode(this.state.modeInfo.mode);
        }
    }

    loadAceEditor() {
        var editor = ace.edit("id_sql");

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

        var aceLanguageTools = ace.require('ace/ext/language_tools');
        editor.setOptions({
            enableBasicAutocompletion: true,
            enableSnippets: true,
            enableLiveAutocompletion: true,
            showPrintMargin: false,
            highlightActiveLine: false,
            highlightGutterLine: false,
            showLineNumbers: true
        });

        var autocompleteFn = this.props.autocompleteResultsFn;
        aceLanguageTools.addCompleter({
            getCompletions: function(editor, session, pos, prefix, callback) {
                if (prefix.length < 2) {
                    callback(null, []);
                    return;
                }

                autocompleteFn(prefix).then(function (results) {
                    // transform results of the API call into what ACE expects
                    var js_results = results.map(function(result) {
                        return {
                            name: result[0],
                            value: result[0],
                            meta: result[1]
                        };
                    });
                    callback(null, js_results);

                }, function (error) {
                    console.log('error getting autocompletion data', error);
                    callback(null, []);
                });
            }
        });
    }

    setQuery(dataset_query) {
        this.props.setQueryFn(dataset_query);
    }

    onChange(event) {
        if (this.state.editor && !this.localUpdate) {
            var query = this.props.query;
            query.native.query = this.state.editor.getValue();
            this.setQuery(query);
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
            let query = this.props.query;
            query.native.collection = table.name;
            this.setQuery(query);
        }
    }

    render() {
        let modeInfo = getModeInfo(this.props.query, this.props.databases);

        // we only render a db selector if there are actually multiple to choose from
        var dataSelectors = [];
        if (this.state.showEditor && this.props.databases && (this.props.databases.length > 1 || modeInfo.requiresTable)) {
            if (this.props.databases.length > 1) {
                dataSelectors.push(
                    <div key="db_selector" className="GuiBuilder-section GuiBuilder-data flex align-center">
                        <span className="GuiBuilder-section-label Query-label">Database</span>
                        <DataSelector
                            databases={this.props.databases}
                            query={this.props.query}
                            setDatabaseFn={this.setDatabaseID}
                        />
                    </div>
                )
            }
            if (modeInfo.requiresTable) {
                let databases = this.props.databases,
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

        var editorClasses, toggleEditorText, toggleEditorIcon;
        if (this.state.showEditor) {
            editorClasses = "";
            toggleEditorText = "Hide Editor";
            toggleEditorIcon = "contract";
        } else {
            editorClasses = "hide";
            toggleEditorText = "Open Editor";
            toggleEditorIcon = "expand";
        }

        return (
            <div className="wrapper">
                <div className="NativeQueryEditor bordered rounded shadowed">
                    <div className="flex">
                        {dataSelectors}
                        <a className="Query-label no-decoration flex-align-right flex align-center px2" onClick={this.toggleEditor}>
                            <span className="mx2">{toggleEditorText}</span>
                            <Icon name={toggleEditorIcon} width="20" height="20"/>
                        </a>
                    </div>
                    <div className={"border-top " + editorClasses}>
                        <div id="id_sql"></div>
                    </div>
                </div>
            </div>
        );
    }
}
