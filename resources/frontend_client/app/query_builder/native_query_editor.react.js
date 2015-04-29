'use strict';
/*global SelectionModule, DatabaseSelector*/

var NativeQueryEditor = React.createClass({
    displayName: 'NativeQueryEditor',
    propTypes: {
        databases: React.PropTypes.array.isRequired,
        defaultQuery: React.PropTypes.object.isRequired,
        query: React.PropTypes.object.isRequired,
        isRunning: React.PropTypes.bool.isRequired,
        runFn: React.PropTypes.func.isRequired,
        notifyQueryModifiedFn: React.PropTypes.func.isRequired,
        autocompleteResultsFn: React.PropTypes.func.isRequired
    },
    getInitialState: function() {
        return {};
    },
    componentDidMount: function() {
        this.loadAceEditor();
    },
    loadAceEditor: function() {
        console.log('loading ace editor');
        var editor = ace.edit("id_sql");

        // TODO: theme?

        // set editor mode appropriately
        // TODO: at some point we could make this dynamic based on database type
        editor.getSession().setMode("ace/mode/sql");

        // listen to onChange events
        editor.getSession().on('change', this.onChange);

        // initialize the content
        editor.setValue(this.props.query.native.query);

        // hmmm, this could be dangerous
        editor.focus();

        this.setState({
            editor: editor
        });

        var aceLanguageTools = ace.require('ace/ext/language_tools');
        editor.setOptions({
            enableBasicAutocompletion: true,
            enableSnippets: true,
            enableLiveAutocompletion: true
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
                })
            }
        });
    },
    setDatabase: function(databaseId) {
        // check if this is the same db or not
        if (databaseId !== this.props.query.database) {
            // reset to a brand new query
            var query = this.props.defaultQuery;

            // set our new database on the query
            query.database = databaseId;

            // notify parent that we've started over
            this.props.notifyQueryModifiedFn(query);
        }
    },
    canRunQuery: function() {
        return (this.props.query.database !== undefined && this.props.query.native.query !== "");
    },
    runQuery: function() {
        this.props.runFn(this.props.query);
    },
    onChange: function(event) {
        if (this.state.editor) {
            var query = this.props.query;
            query.native.query = this.state.editor.getValue();
            this.props.notifyQueryModifiedFn(query);
        }
    },
    render: function () {
        //console.log(this.props.query);
        // we only render a db selector if there are actually multiple to choose from
        var dbSelector;
        if(this.props.databases && this.props.databases.length > 1) {
            dbSelector = (
                <DatabaseSelector
                    databases={this.props.databases}
                    setDatabase={this.setDatabase}
                    currentDatabaseId={this.props.query.database}
                />
            );
        }

        return (
            <div>
                <div id="id_sql" className="border-bottom"></div>
                <div>
                    {dbSelector}
                    <RunButton
                        canRun={this.canRunQuery()}
                        isRunning={this.props.isRunning}
                        runFn={this.runQuery}
                    />
                </div>
            </div>
        );
    }
});
