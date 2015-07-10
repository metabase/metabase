'use strict';

import Icon from './icon.react';
import inflection from 'inflection';

import Query from './query';

var cx = React.addons.classSet;

export default React.createClass({
    displayName: 'DataReferenceField',

    getInitialState: function() {
        return {
            table: undefined
        };
    },

    componentWillMount: function() {
        this.props.Metabase.table_query_metadata({
            'tableId': this.props.field.table_id
        }).$promise.then((table) => {
            this.setState({ table: table });
        });
    },

    filterBy: function() {
        var query = this.props.query;
        this.setDatabaseAndTable();
        Query.addFilter(query.query);
        Query.updateFilter(query.query, Query.getFilters(query.query).length - 1, [null, this.props.field.id, null]);
        this.props.notifyQueryModifiedFn(query);
    },

    groupBy: function() {
        var query = this.props.query;
        this.setDatabaseAndTable();
        if (!Query.hasValidAggregation(query.query)) {
            Query.updateAggregation(query.query, ["rows"]);
        }
        Query.addDimension(query.query);
        Query.updateDimension(query.query, this.props.field.id, query.query.breakout.length - 1);
        this.props.notifyQueryModifiedFn(query);
    },

    setDatabaseAndTable: function() {
        var query = this.props.query;
        if (query.database == undefined && this.table) {
            query.database = this.state.table.db_id;
        }
        if (query.query.source_table == undefined) {
            query.database = this.props.field.table_id;
        }
    },

    renderFilterByButton: function() {
        var query = this.props.query;
        if (query.database == undefined) {

        }
    },

    render: function() {
        console.log(this.props, this.state)
        var name = inflection.humanize(this.props.field.name);
        return (
            <div>
                <h1>{name}</h1>
                <p>{this.props.field.description}</p>
                <p className="text-bold">Use for current question</p>
                <ul className="my2">
                    <li className="mt1">
                        <a className="Button Button--white text-default no-decoration" href="#" onClick={this.filterBy}>
                            <Icon className="mr1" name="add" width="12px" height="12px"/> Filter by {name}
                        </a>
                    </li>
                    <li className="mt1">
                        <a className="Button Button--white text-default no-decoration" href="#" onClick={this.groupBy}>
                            <Icon className="mr2" name="add" width="12px" height="12px" /> Group by {name}
                        </a>
                    </li>
                </ul>
                {this.state.table&&this.state.table.name}
                <p className="text-bold">Potentially useful questions</p>
                <ul></ul>
            </div>
        );
    },
})
