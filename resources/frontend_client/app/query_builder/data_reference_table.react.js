'use strict';

import Icon from './icon.react';
import DataReferenceQueryButton from './data_reference_query_button.react';
import inflection from 'inflection';

import Query from './query';

var cx = React.addons.classSet;

export default React.createClass({
    displayName: 'DataReferenceTable',
    propTypes: {
        query: React.PropTypes.object.isRequired,
        loadTableFn: React.PropTypes.func.isRequired,
        closeFn: React.PropTypes.func.isRequired,
        runQueryFn: React.PropTypes.func.isRequired,
        setQueryFn: React.PropTypes.func.isRequired,
        setDatabaseFn: React.PropTypes.func.isRequired,
        setSourceTableFn: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        return {
            table: undefined,
            tableForeignKeys: undefined,
            pane: "fields"
        };
    },

    componentWillMount: function() {
        this.props.loadTableFn(this.props.table.id).then((result) => {
            this.setState({
                table: result.metadata,
                tableForeignKeys: result.foreignKeys
            });
        });
    },

    showPane: function(name) {
        this.setState({ pane: name });
    },

    setQueryAllRows: function() {
        var query;
        query = this.props.setDatabaseFn(this.state.table.db_id);
        query = this.props.setSourceTableFn(this.state.table.id);
        query.query.aggregation = ["rows"];
        query.query.breakout = [];
        query.query.filter = [];
        query = this.props.setQueryFn(query);
        this.props.runQueryFn(query);
    },

    render: function(page) {
        var table = this.state.table;
        if (table) {
            var name = inflection.humanize(table.name);
            var queryButton;
            if (table.rows != null) {
                var words = inflection.humanize(table.name, true).split(" ");
                words.push(inflection.inflect(words.pop(), table.rows)); // inflect the last word
                var text = "Show all " + table.rows.toLocaleString() + " rows in " + name
                queryButton = (<DataReferenceQueryButton className="border-bottom border-top mb3" icon="illustration-icon-table" text={text} onClick={this.setQueryAllRows} />);
            }
            var fieldCount = table.fields.length + " " + inflection.inflect("field", table.fields.length);
            var panes = {
                "fields": fieldCount,
                // "metrics": "0 Metrics",
                "connections": "O Connections"
            };
            var tabs = Object.keys(panes).map((name) => {
                var classes = cx({
                    'Button': true,
                    'Button--small': true,
                    'Button--active': name === this.state.pane
                });
                return <a key={name} className={classes} href="#" onClick={this.showPane.bind(null, name)}>{panes[name]}</a>
            });

            var pane;
            if (this.state.pane === "fields") {
                var fields = table.fields.map((field, index) => {
                    var classes = cx({ 'p1' : true, 'border-bottom': index !== table.fields.length - 1 })
                    var name =  inflection.humanize(field.name);
                    return (
                        <li key={field.id} className={classes}>
                            <a className="text-brand no-decoration" href="#" onClick={this.props.showField.bind(null, field)}>{name}</a>
                        </li>
                    );
                });
                pane = <ul>{fields}</ul>;
            }

            return (
                <div>
                    <h1>{name}</h1>
                    <p>{table.description}</p>
                    {queryButton}
                    <div className="Button-group Button-group--brand text-uppercase">
                        {tabs}
                    </div>
                    {pane}
                </div>
            );
        } else {
            return null;
        }
    }
})
