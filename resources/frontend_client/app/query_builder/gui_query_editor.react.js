'use strict';
/*global _*/

import AggregationWidget from './aggregation_widget.react';
import DatabaseSelector from './database_selector.react';
import FilterWidget from './filter_widget.react';
import Icon from './icon.react';
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
        defaultQuery: React.PropTypes.object.isRequired,
        isRunning: React.PropTypes.bool.isRequired,
        isExpanded: React.PropTypes.bool.isRequired,
        runFn: React.PropTypes.func.isRequired,
        notifyQueryModifiedFn: React.PropTypes.func.isRequired,
        toggleExpandCollapseFn: React.PropTypes.func.isRequired
    },

    getDefaultProps: function() {
        return {
            querySectionClasses: 'Query-section mt1 md-mt2 flex align-center'
        };
    },

    setQuery: function(dataset_query) {
        this.props.notifyQueryModifiedFn(dataset_query);
    },

    setDatabase: function(databaseId) {
        if (databaseId !== this.props.query.database) {
            // reset to a brand new query
            var query = this.props.defaultQuery;

            // set our new database on the query
            query.database = databaseId;

            // notify parent that we've started over
            // TODO: should this clear the visualization as well?
            this.props.notifyQueryModifiedFn(query);

            // load rest of the data we need
            this.props.loadDatabaseInfoFn(databaseId);
        }
    },

    setSourceTable: function(sourceTable) {
        // this will either be the id or an object with an id
        var tableId = sourceTable.id || sourceTable;
        this.props.loadTableInfoFn(tableId);

        // when the table changes we reset everything else in the query, except the database of course
        // TODO: should this clear the visualization as well?
        var query = this.props.defaultQuery;
        query.database = this.props.query.database;
        query.query.source_table = tableId;

        this.setQuery(query);
    },

    canRun: function() {
        return Query.canRun(this.props.query.query);
    },

    runQuery: function() {
        Query.cleanQuery(this.props.query.query);
        this.props.runFn(this.props.query);
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
            <span className="mr1">
                <Icon name="add" width="12px" height="12px" />
            </span>
        )
    },

    renderDbSelector: function() {
        if(this.props.databases && this.props.databases.length > 1) {
            return (
                <div className={this.props.querySectionClasses + ' mt1 lg-mt2'}>
                    <span className="Query-label">Data source:</span>
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
                <div className={this.props.querySectionClasses}>
                    <span className="Query-label">Table:</span>
                    <SelectionModule
                        placeholder="What part of your data?"
                        items={this.props.tables}
                        display="name"
                        selectedValue={this.props.query.query.source_table}
                        selectedKey="id"
                        isInitiallyOpen={sourceTableListOpen}
                        action={this.setSourceTable}
                    />
                    <ReactCSSTransitionGroup transitionName="Transition-qb-section">
                        {this.renderFilterButton()}
                    </ReactCSSTransitionGroup>
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
                    <div className="Query-label">
                        Grouped by:
                    </div>
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
                        <div className="DimensionList">
                            <SelectionModule
                                placeholder='What part of your data?'
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
                addBreakoutButton = (
                    <a className="QueryOption QueryOption--offset p1 lg-p2" onClick={this.addDimension}>
                        {this.renderAddIcon()}
                        Add a grouping
                    </a>
                );
            } else if (this.props.query.query.breakout.length === 1 &&
                            this.props.query.query.breakout[0] !== null) {
                addBreakoutButton = (
                    <a className="QueryOption p1 lg-p2 ml1 lg-ml2" onClick={this.addDimension}>
                        {this.renderAddIcon()}
                        Add another grouping
                    </a>
                );
            }

            return (
                <div className={this.props.querySectionClasses}>
                    {breakoutLabel}
                    {breakoutList}
                    {addBreakoutButton}
                </div>
            );
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

    renderFilterSelector: function() {
        var queryFilters = Query.getFilters(this.props.query.query);

        if (this.props.options && queryFilters && queryFilters.length > 0) {
            var component = this;

            var filterFieldList = [];
            for(var key in this.props.options.fields_lookup) {
                filterFieldList.push(this.props.options.fields_lookup[key]);
            }

            var filterList = queryFilters.map(function (filter, index) {
                if(index > 0) {
                    return (
                        <FilterWidget
                            placeholder="Item"
                            filter={filter}
                            filterFieldList={filterFieldList}
                            index={index}
                            removeFilter={component.removeFilter}
                            updateFilter={component.updateFilter}
                        />
                    );
                }
            }.bind(this));

            // TODO: proper check for isFilterComplete(filter)
            var addFilterButton;
            if (Query.canAddFilter(this.props.query.query)) {
                addFilterButton = (
                    <a className="QueryOption p1 lg-p2" onClick={this.addFilter}>
                        {this.renderAddIcon()}
                        Add another filter
                    </a>
                );
            }

            return (
                <div className={this.props.querySectionClasses}>
                    <span className="Query-label">Filtered by:</span>
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
                <div className={this.props.querySectionClasses}>
                    <span className="Query-label">Limit and sort:</span>
                    <div className="Query-filters">
                        {limitSection}
                        {sortSection}
                    </div>
                </div>
            );

        } else if (Query.canAddLimitAndSort(this.props.query.query)) {
            return (
                <div className={this.props.querySectionClasses}>
                    <a className="QueryOption QueryOption--offset p1 lg-p2" onClick={this.addLimit}>
                        {this.renderAddIcon()}
                        Set row limits and sorting
                    </a>
                </div>
            );
        }

    },

    toggleOpen: function() {
        this.props.toggleExpandCollapseFn();
    },

    toggleText: function() {
        return (this.props.isExpanded) ? 'Hide query' : 'Show query';
    },

    toggleIcon: function () {
        var iconSize = '12px'
        if(this.props.isExpanded) {
            return (
                <Icon name='chevronup' width={iconSize} height={iconSize} />
            );
        } else {
            return (
                <Icon name='chevrondown' width={iconSize} height={iconSize} />
            );
        }
    },

    openStatus: function() {
        return (
            <a href="#" className="QueryToggle px2 py1 no-decoration bg-white flex align-center" onClick={this.toggleOpen}>
                <span className="mr1">
                    {this.toggleIcon()}
                </span>
                {this.toggleText()}
            </a>
        );
    },

    render: function() {
        var guiBuilderClasses = cx({
            'GuiBuilder': true,
            'wrapper': true,
            'GuiBuilder--collapsed': !this.props.isExpanded,
        });
        return (
            <div className={guiBuilderClasses}>
                <ReactCSSTransitionGroup transitionName="Transition-qb-section">
                    {this.renderDbSelector()}
                </ReactCSSTransitionGroup>

                <ReactCSSTransitionGroup transitionName="Transition-qb-section">
                    {this.renderTableSelector()}
                </ReactCSSTransitionGroup>

                <ReactCSSTransitionGroup transitionName="Transition-qb-section">
                    {this.renderFilterSelector()}
                </ReactCSSTransitionGroup>

                <ReactCSSTransitionGroup transitionName="Transition-qb-section">
                    {this.renderAggregation()}
                </ReactCSSTransitionGroup>

                <ReactCSSTransitionGroup transitionName="Transition-qb-section">
                    {this.renderBreakouts()}
                </ReactCSSTransitionGroup>

                <ReactCSSTransitionGroup transitionName="Transition-qb-section">
                    {this.renderLimitAndSort()}
                </ReactCSSTransitionGroup>

                <div className="Query-section Query-section--right mb2">
                    <RunButton
                        canRun={this.canRun()}
                        isRunning={this.props.isRunning}
                        runFn={this.runQuery}
                    />
                </div>
                <div className="QueryToggleWrapper absolute left right flex layout-centered">
                    {this.openStatus()}
                </div>
            </div>
        );
    }
});
