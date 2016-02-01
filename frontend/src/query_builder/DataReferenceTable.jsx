import React, { Component, PropTypes } from "react";

import DataReferenceQueryButton from './DataReferenceQueryButton.jsx';
import { foreignKeyCountsByOriginTable } from 'metabase/lib/schema_metadata';
import inflection from 'inflection';
import cx from "classnames";

export default class DataReferenceTable extends Component {
    constructor(props, context) {
        super(props, context);
        this.setQueryAllRows = this.setQueryAllRows.bind(this);
        this.showPane = this.showPane.bind(this);

        this.state = {
            table: undefined,
            tableForeignKeys: undefined,
            pane: "fields"
        };
    }

    static propTypes = {
        query: PropTypes.object.isRequired,
        loadTableFn: PropTypes.func.isRequired,
        closeFn: PropTypes.func.isRequired,
        runQueryFn: PropTypes.func.isRequired,
        setQueryFn: PropTypes.func.isRequired,
        setDatabaseFn: PropTypes.func.isRequired,
        setSourceTableFn: PropTypes.func.isRequired
    };

    componentWillMount() {
        this.props.loadTableFn(this.props.table.id).then((result) => {
            this.setState({
                table: result.table,
                tableForeignKeys: result.foreignKeys
            });
        }).catch((error) => {
            this.setState({
                error: "An error occurred loading the table"
            });
        });
    }

    showPane(name) {
        this.setState({ pane: name });
    }

    setQueryAllRows() {
        var query;
        query = this.props.setDatabaseFn(this.state.table.db_id);
        query = this.props.setSourceTableFn(this.state.table.id);
        query.query.aggregation = ["rows"];
        query.query.breakout = [];
        query.query.filter = [];
        this.props.setQueryFn(query);
        this.props.runQueryFn();
    }

    render() {
        const { table, error } = this.state;
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
                    <a key={name} className={classes} onClick={this.showPane.bind(null, name)}>
                        <span className="DataReference-paneCount">{count}</span><span>{inflection.inflect(name, count)}</span>
                    </a>
                );
            });

            var pane;
            if (this.state.pane === "fields") {
                var fields = table.fields.map((field, index) => {
                    return (
                        <li key={field.id} className="p1 border-row-divider">
                            <a className="text-brand text-brand-darken-hover no-decoration" onClick={this.props.showField.bind(null, field)}>{field.display_name}</a>
                        </li>
                    );
                });
                pane = <ul>{fields}</ul>;
            } else if (this.state.pane === "connections") {
                const fkCountsByTable = foreignKeyCountsByOriginTable(this.state.tableForeignKeys);

                var connections = this.state.tableForeignKeys.sort(function(a, b) {
                    return a.origin.table.display_name.localeCompare(b.origin.table.display_name);
                }).map((fk, index) => {
                    const via = (fkCountsByTable[fk.origin.table.id] > 1) ? (<span className="text-grey-3 text-light h5"> via {fk.origin.display_name}</span>) : null;

                    return (
                        <li key={fk.id} className="p1 border-row-divider">
                            <a className="text-brand text-brand-darken-hover no-decoration" onClick={this.props.showField.bind(null, fk.origin)}>{fk.origin.table.display_name}{via}</a>
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
            return (
                <div>{error}</div>
            );
        }
    }
}
