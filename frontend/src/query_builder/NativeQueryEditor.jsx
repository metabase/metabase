/*global ace*/

import React, { Component, PropTypes } from "react";

import DataSelector from './DataSelector.jsx';
import Icon from "metabase/components/Icon.jsx";

export default class NativeQueryEditor extends Component {
    constructor(props, context) {
        super(props, context);
        this.onChange = this.onChange.bind(this);
        this.toggleEditor = this.toggleEditor.bind(this);

        this.state = {
            showEditor: false
        };
    }

    static propTypes = {
        databases: PropTypes.array.isRequired,
        query: PropTypes.object.isRequired,
        setQueryFn: PropTypes.func.isRequired,
        setDatabaseFn: PropTypes.func.isRequired,
        autocompleteResultsFn: PropTypes.func.isRequired
    };

    componentWillMount() {
        // if the sql is empty then start with the editor showing, otherwise our default is to start out collapsed
        if (!this.props.query.native.query) {
            this.setState({
                showEditor: true
            });
        }
    }

    componentDidMount() {
        this.loadAceEditor();
    }

    loadAceEditor() {
        var editor = ace.edit("id_sql");

        // TODO: theme?

        // set editor mode appropriately
        // TODO: at some point we could make this dynamic based on database type
        editor.getSession().setMode("ace/mode/sql");

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
        if (this.state.editor) {
            var query = this.props.query;
            query.native.query = this.state.editor.getValue();
            this.setQuery(query);
        }
    }

    toggleEditor() {
        this.setState({ showEditor: !this.state.showEditor })
    }

    render() {
        // we only render a db selector if there are actually multiple to choose from
        var dbSelector;
        if(this.state.showEditor && this.props.databases && this.props.databases.length > 1) {
            dbSelector = (
                <div className="GuiBuilder-section GuiBuilder-data flex align-center">
                    <span className="GuiBuilder-section-label Query-label">Database</span>
                    <DataSelector
                        databases={this.props.databases}
                        query={this.props.query}
                        setDatabaseFn={this.props.setDatabaseFn}
                    />
                </div>
            );
        } else {
            dbSelector = <span className="p2 text-grey-4">This question is written in SQL.</span>;
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
                        {dbSelector}
                        <a href="#" className="Query-label no-decoration flex-align-right flex align-center px2" onClick={this.toggleEditor}>
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
