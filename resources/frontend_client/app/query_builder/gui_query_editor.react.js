'use strict';
/*global _*/

import AggregationWidget from './aggregation_widget.react';
import DatabaseSelector from './database_selector.react';
import FilterWidget from './filter_widget.react';
import Icon from './icon.react';
import IconBorder from './icon_border.react';
import LimitWidget from './limit_widget.react';
import RunButton from './run_button.react';
import SelectionModule from './selection_module.react';
import SortWidget from './sort_widget.react';

import Query from './query';

var cx = React.addons.classSet;
var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

export default React.createClass({
    displayName: 'GuiQueryEditor',
    propTypes: {
        databases: React.PropTypes.array.isRequired,
        query: React.PropTypes.object.isRequired,
        isRunning: React.PropTypes.bool.isRequired,
        isExpanded: React.PropTypes.bool.isRequired,
        runQueryFn: React.PropTypes.func.isRequired,
        setQueryFn: React.PropTypes.func.isRequired,
        setDatabaseFn: React.PropTypes.func.isRequired,
        setSourceTableFn: React.PropTypes.func.isRequired,
        toggleExpandCollapseFn: React.PropTypes.func.isRequired
    },

    setQuery: function(dataset_query) {
        this.props.setQueryFn(dataset_query);
    },

    setDatabase: function(databaseId) {
        this.props.setDatabaseFn(databaseId);
    },

    setSourceTable: function(sourceTable) {
        this.props.setSourceTableFn(sourceTable);
    },

    canRun: function() {
        return Query.canRun(this.props.query.query);
    },

    runQuery: function() {
        this.props.runQueryFn(this.props.query);
    },

    addDimension: function() {
        Query.addDimension(this.props.query.query);
        this.setQuery(this.props.query);
    },

    updateDimension: function(dimension, index) {
        Query.updateDimension(this.props.query.query, dimension, index);
        this.setQuery(this.props.query);
    },

    removeDimension: function(index) {
        Query.removeDimension(this.props.query.query, index);
        this.setQuery(this.props.query);
    },

    updateAggregation: function(aggregationClause) {
        Query.updateAggregation(this.props.query.query, aggregationClause);
        this.setQuery(this.props.query);
    },

    addFilter: function() {
        Query.addFilter(this.props.query.query);
        this.setQuery(this.props.query);
    },

    updateFilter: function(index, filter) {
        Query.updateFilter(this.props.query.query, index, filter);
        this.setQuery(this.props.query);
    },

    removeFilter: function(index) {
        Query.removeFilter(this.props.query.query, index);
        this.setQuery(this.props.query);
    },

    addLimit: function() {
        Query.addLimit(this.props.query.query);
        this.setQuery(this.props.query);
    },

    updateLimit: function(limit) {
        Query.updateLimit(this.props.query.query, limit);
        this.setQuery(this.props.query);
    },

    removeLimit: function() {
        Query.removeLimit(this.props.query.query);
        this.setQuery(this.props.query);
    },

    addSort: function() {
        Query.addSort(this.props.query.query);
        this.setQuery(this.props.query);
    },

    updateSort: function(index, sort) {
        Query.updateSort(this.props.query.query, index, sort);
        this.setQuery(this.props.query);
    },

    removeSort: function(index) {
        Query.removeSort(this.props.query.query, index);
        this.setQuery(this.props.query);
    },

    getSortableFields: function() {
        return Query.getSortableFields(this.props.query.query, this.props.options.fields_lookup);
    },

    renderAddIcon: function () {
        return (
            <IconBorder className="text-grey-2" borderRadius="3px">
                <Icon name="add" width="14px" height="14px" />
            </IconBorder>
        )
    },

    renderDbSelector: function() {
        if(this.props.databases && this.props.databases.length > 1) {
            return (
                <div className="Query-section">
                    <span className="Query-label">Data</span>
                    <DatabaseSelector
                        databases={this.props.databases}
                        setDatabase={this.setDatabase}
                        currentDatabaseId={this.props.query.database}
                    />
                </div>
            );
        }
    },

    renderTableSelector: function() {
        if (this.props.tables) {
            var sourceTableListOpen = true;
            if(this.props.query.query.source_table) {
                sourceTableListOpen = false;
            }

            // if we don't have any filters applied yet then provide an option to do that


            return (
                <div className="Query-section">
                    <span className="Query-label">Table</span>
                    <SelectionModule
                        placeholder="What part of your data?"
                        items={this.props.tables}
                        display="name"
                        selectedValue={this.props.query.query.source_table}
                        selectedKey="id"
                        isInitiallyOpen={sourceTableListOpen}
                        action={this.setSourceTable}
                    />
                </div>
            );
        }
    },

    renderFilterButton: function() {
        if (this.props.query.query.source_table &&
                Query.getFilters(this.props.query.query).length === 0 &&
                this.props.options &&
                this.props.options.fields.length > 0) {
            return (
                <a className="QueryOption flex align-center p1 lg-p2 ml2" onClick={this.addFilter}>
                    <Icon name='filter' width={16} height={ 16} viewBox='0 0 16 16' />
                    <span className="mr1">Filter</span> <span>{(this.props.options) ? this.props.options.name : ''}</span>
                </a>
            );
        }
    },

    renderBreakouts: function() {
        // breakout clause.  must have table details available & a valid aggregation defined
        if (this.props.options &&
                this.props.options.breakout_options.fields.length > 0 &&
                !Query.hasEmptyAggregation(this.props.query.query)) {

            // only render a label for our breakout if we have a valid breakout clause already
            var breakoutLabel;
            if(this.props.query.query.breakout.length > 0) {
                breakoutLabel = (
                    <span className="text-bold">
                        by
                    </span>
                );
            }

            var breakoutList;
            if(this.props.options.breakout_options) {
                breakoutList = this.props.query.query.breakout.map(function (breakout, index) {
                    var breakoutListOpen = false;
                    if(breakout === null) {
                        breakoutListOpen = true;
                    }

                    return (
                        <div className="DimensionList inline-block" key={index}>
                            <SelectionModule
                                placeholder='...'
                                display="1"
                                items={this.props.options.breakout_options.fields}
                                selectedValue={breakout}
                                selectedKey="0"
                                index={index}
                                isInitiallyOpen={breakoutListOpen}
                                action={this.updateDimension}
                                remove={this.removeDimension}
                            />
                        </div>
                    );
                }.bind(this));
            }

            // include a button to add a breakout, up to 2 total
            var addBreakoutButton;
            if (this.props.query.query.breakout.length === 0) {
                addBreakoutButton = this.renderAdd("Add a grouping", this.addDimension);
            } else if (this.props.query.query.breakout.length === 1 &&
                            this.props.query.query.breakout[0] !== null) {
                addBreakoutButton = this.renderAdd(null, this.addDimension);
            }

            return (
                <div className="Query-section">
                    {breakoutLabel}
                    {breakoutList}
                    {addBreakoutButton}
                </div>
            );
        }
    },

    renderAdd: function(text, onClick) {
        if (text) {
            return (
                <a className="text-grey-2 text-bold no-decoration flex align-center" href="#" onClick={onClick}>
                    <span className="p1">{this.renderAddIcon()}</span>
                    <span>{text}</span>
                </a>
            );
        } else {
            return (
                <a className="text-grey-2 text-bold no-decoration" href="#" onClick={onClick}>
                    <span className="p1">{this.renderAddIcon()}</span>
                </a>
            )
        }
    },

    renderAggregation: function() {
        // aggregation clause.  must have table details available
        if(this.props.options) {
            return (
                <AggregationWidget
                    aggregation={this.props.query.query.aggregation}
                    aggregationOptions={this.props.options.aggregation_options}
                    updateAggregation={this.updateAggregation}>
                </AggregationWidget>
            );
        }
    },

    renderFilters: function() {
        var queryFilters = Query.getFilters(this.props.query.query);

        if (this.props.options) {
            var filterFieldList = [];
            for(var key in this.props.options.fields_lookup) {
                filterFieldList.push(this.props.options.fields_lookup[key]);
            }

            var filterList;
            if (queryFilters && queryFilters.length > 0) {
                filterList = queryFilters.map((filter, index) => {
                    if(index > 0) {
                        return (
                            <FilterWidget
                                key={filter[1]}
                                placeholder="Item"
                                filter={filter}
                                filterFieldList={filterFieldList}
                                index={index}
                                removeFilter={this.removeFilter}
                                updateFilter={this.updateFilter}
                            />
                        );
                    }
                });
            }

            // TODO: proper check for isFilterComplete(filter)
            var addFilterButton;
            if (Query.canAddFilter(this.props.query.query)) {
                if (filterList) {
                    addFilterButton = this.renderAdd(null, this.addFilter);
                } else {
                    addFilterButton = this.renderAdd("Add filters to narrow your answer", this.addFilter);
                }
            }

            return (
                <div className="Query-section">
                    <div className="Query-filters">
                        {filterList}
                        {addFilterButton}
                    </div>
                </div>
            );
        }

    },

    renderLimitAndSort: function() {
        if (this.props.options && !Query.hasEmptyAggregation(this.props.query.query) &&
                (this.props.query.query.limit !== undefined || this.props.query.query.order_by !== undefined)) {

            var limitSection;
            if (this.props.query.query.limit !== undefined) {
                limitSection = (
                    <LimitWidget
                        limit={this.props.query.query.limit}
                        updateLimit={this.updateLimit}
                        removeLimit={this.removeLimit}
                    />
                );
            } else {
                limitSection = (
                    <div className="QueryOption p1 lg-p2 flex align-center">
                        <a onClick={this.addLimit}>
                            {this.renderAddIcon()}
                            Add row limit
                        </a>
                    </div>
                );
            }

            var sortList = [];
            if (this.props.query.query.order_by) {
                var sortableFields = this.getSortableFields();

                var component = this;
                sortList = this.props.query.query.order_by.map(function (order_by, index) {
                    return (
                        <SortWidget
                            placeholder="Attribute"
                            sort={order_by}
                            fieldList={sortableFields}
                            index={index}
                            removeSort={component.removeSort}
                            updateSort={component.updateSort}
                        />
                    );
                }.bind(this));
            }

            var sortSection;
            if (sortList.length === 0) {
                sortSection = (
                    <div className="QueryOption p1 lg-p2 flex align-center">
                        <a onClick={this.addSort}>
                            {this.renderAddIcon()}
                            Add sort
                        </a>
                    </div>
                );
            } else {
                var addSortButton;
                if (Query.canAddSort(this.props.query.query)) {
                    addSortButton = (
                        <a onClick={this.addSort}>Add another sort</a>
                    );
                }

                sortSection = (
                    <div className="flex align-center">
                        <span className="m2">sorted by</span>
                        {sortList}
                        {addSortButton}
                    </div>
                );
            }

            return (
                <div className="Query-section">
                    <span className="Query-label">Limit and sort:</span>
                    <div className="Query-filters">
                        {limitSection}
                        {sortSection}
                    </div>
                </div>
            );

        } else if (Query.canAddLimitAndSort(this.props.query.query)) {
            return (
                <div className="Query-section">
                    <a className="QueryOption p1 lg-p2" onClick={this.addLimit}>
                        ...
                    </a>
                </div>
            );
        }

    },

    renderDataSection: function() {
        var table = this.props.tables && this.props.tables.filter((t) => t.id === this.props.query.query.source_table)[0]

        var content;
        if (table) {
            content = <span className="text-grey">{table.display_name}</span>;
        } else {
            content = <span className="text-grey-4">Select a table</span>;
        }

        return (
            <div className="GuiBuilder-section GuiBuilder-data flex align-center arrow-right">
                <span className="GuiBuilder-section-label">Data</span>
                <a className="text-bold cursor-pointer flex align-center">
                    {content}
                    <Icon className="ml1" name="chevrondown" width="8px" height="8px"/>
                </a>
            </div>
        );
    },

    renderFilterSection: function() {
        return (
            <div className="GuiBuilder-section GuiBuilder-filtered-by flex align-center">
                <span className="GuiBuilder-section-label">Filtered by</span>
                {this.renderFilters()}
            </div>
        );
    },

    renderViewSection: function() {
        return (
            <div className="GuiBuilder-section GuiBuilder-view flex-full flex align-center">
                <span className="GuiBuilder-section-label">View</span>
                {this.renderAggregation()}
                {this.renderBreakouts()}
            </div>
        );
    },

    renderSortLimitSection: function() {
        return (
            <div className="GuiBuilder-section GuiBuilder-sort-limit flex align-center">
                <a className="no-decoration text-grey-1 px1" href="#">…</a>
            </div>
        );
    },

    render: function() {
        return (
            <div className="wrapper">
                <div className="GuiBuilder bordered rounded">
                        {this.renderDataSection()}
                        {this.renderFilterSection()}
                        {this.renderViewSection()}
                        {this.renderSortLimitSection()}
                </div>

                <div className="Query-section Query-section--right mb2">
                    <RunButton
                        canRun={this.canRun()}
                        isRunning={this.props.isRunning}
                        runFn={this.runQuery}
                    />
                </div>
            </div>
        );
    }
});
