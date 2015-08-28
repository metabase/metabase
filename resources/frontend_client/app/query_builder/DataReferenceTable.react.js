'use strict';

import Icon from "metabase/components/Icon.react";
import DataReferenceQueryButton from './DataReferenceQueryButton.react';
import inflection from 'inflection';

import Query from "metabase/lib/query";

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
            var queryButton;
            if (table.rows != null) {
                var text = "Show all " + table.rows.toLocaleString() + " rows in " + table.display_name
                queryButton = (<DataReferenceQueryButton className="border-bottom border-top mb3" icon="illustration-icon-table" text={text} onClick={this.setQueryAllRows} />);
            }
            var panes = {
                "fields": table.fields.length,
                // "metrics": 0,
                "connections": this.state.tableForeignKeys.length
            };
            var tabs = Object.keys(panes).map((name) => {
                var count = panes[name];
                var classes = cx({
                    'Button': true,
                    'Button--small': true,
                    'Button--active': name === this.state.pane
                });
                return (
                    <a key={name} className={classes} href="#" onClick={this.showPane.bind(null, name)}>
                        <span className="DataReference-paneCount">{count}</span><span>{inflection.inflect(name, count)}</span>
                    </a>
                );
            });

            var pane;
            if (this.state.pane === "fields") {
                var fields = table.fields.map((field, index) => {
                    return (
                        <li key={field.id} className="p1 border-row-divider">
                            <a className="text-brand text-brand-darken-hover no-decoration" href="#" onClick={this.props.showField.bind(null, field)}>{field.display_name}</a>
                        </li>
                    );
                });
                pane = <ul>{fields}</ul>;
            } else if (this.state.pane === "connections") {
                var connections = this.state.tableForeignKeys.map((fk, index) => {
                    return (
                        <li key={fk.id} className="p1 border-row-divider">
                            <a className="text-brand text-brand-darken-hover no-decoration" href="#" onClick={this.props.showField.bind(null, fk.origin)}>{fk.origin.table.display_name}</a>
                        </li>
                    );
                });
                pane = <ul>{connections}</ul>;
            }

            var descriptionClasses = cx({ "text-grey-3": !table.description });
            var description = (<p className={descriptionClasses}>{table.description || "No description set."}</p>);

            return (
                <div>
                    <h1>{table.display_name}</h1>
                    {description}
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
