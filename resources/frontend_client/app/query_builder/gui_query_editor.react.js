'use strict';
/*global _, cx, AggregationWidget, FilterWidget, LimitWidget, SortWidget, RunButton, SelectionModule, DatabaseSelector, Icon*/

var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

var GuiQueryEditor = React.createClass({
    displayName: 'GuiQueryEditor',
    propTypes: {
        databases: React.PropTypes.array.isRequired,
        query: React.PropTypes.object.isRequired,
        defaultQuery: React.PropTypes.object.isRequired,
        isRunning: React.PropTypes.bool.isRequired,
        getTablesFn: React.PropTypes.func.isRequired,
        getTableDetailsFn: React.PropTypes.func.isRequired,
        runFn: React.PropTypes.func.isRequired,
        notifyQueryModifiedFn: React.PropTypes.func.isRequired
    },

    getDefaultProps: function() {
        return {
            querySectionClasses: 'Query-section flex align-center'
        };
    },

    getInitialState: function() {
        return {
            tables: null,
            options: null,
            isOpen: true
        };
    },

    componentDidMount: function() {
        // if we know our database then load related information
        if (this.props.query.database) {
            this.loadDatabaseInfo(this.props.query.database);
        }

        // if we also know our table then load it's related information
        if (this.props.query.query.source_table) {
            this.loadTableInfo(this.props.query.query.source_table);
        }
    },

    setQuery: function(dataset_query, notify) {
        this.props.notifyQueryModifiedFn(dataset_query);
    },

    loadDatabaseInfo: function(databaseId) {
        var component = this;

        // get tables for db
        this.props.getTablesFn(databaseId).then(function (tables) {
            component.setState({
                tables: tables
            });
        }, function (error) {
            console.log('error getting tables', error);
        });
    },

    loadTableInfo: function(tableId) {
        var component = this;

        // get table details
        this.props.getTableDetailsFn(tableId).then(function (table) {
            // Decorate with valid operators
            // TODO: would be better if this was in our component
            var updatedTable = component.props.markupTableFn(table);

            component.setState({
                options: updatedTable
            });
        }, function (error) {
            console.log('error getting table metadata', error);
        });
    },

    setDatabase: function(databaseId) {
        if (databaseId !== this.props.query.database) {
            // reset to a brand new query
            var query = this.props.defaultQuery;

            // set our new database on the query
            query.database = databaseId;

            // clear all previous state
            this.replaceState(this.getInitialState());

            // notify parent that we've started over
            // TODO: should this clear the visualization as well?
            this.props.notifyQueryModifiedFn(query);

            // load rest of the data we need
            this.loadDatabaseInfo(databaseId);
        }
    },

    setSourceTable: function(sourceTable) {
        // this will either be the id or an object with an id
        var tableId = sourceTable.id || sourceTable;
        this.loadTableInfo(tableId);

        // when the table changes we reset everything else in the query, except the database of course
        // TODO: should this clear the visualization as well?
        var query = this.props.defaultQuery;
        query.database = this.props.query.database;
        query.query.source_table = tableId;

        this.setQuery(query, true);
    },

    canRun: function() {
        var canRun = false;
        if (this.hasValidAggregation()) {
            canRun = true;
        }
        return canRun;
    },

    runQuery: function() {
        var cleanQuery = this.cleanQuery(this.props.query);

        this.props.runFn(cleanQuery);
    },

    cleanQuery: function(dataset_query) {
        // it's possible the user left some half-done parts of the query on screen when they hit the run button, so find those
        // things now and clear them out so that we have a nice clean set of valid clauses in our query

        // TODO: breakouts

        // filters
        var queryFilters = this.getFilters();
        if (queryFilters.length > 1) {
            var hasNullValues = function(arr) {
                for (var j=0; j < arr.length; j++) {
                    if (arr[j] === null) {
                        return true;
                    }
                }

                return false;
            };

            var cleanFilters = [queryFilters[0]];
            for (var i=1; i < queryFilters.length; i++) {
                if (!hasNullValues(queryFilters[i])) {
                    cleanFilters.push(queryFilters[i]);
                }
            }

            if (cleanFilters.length > 1) {
                dataset_query.query.filter = cleanFilters;
            } else {
                dataset_query.query.filter = [];
            }
        }

        // TODO: limit

        // TODO: sort

        return dataset_query;
    },

    canAddDimensions: function() {
        var MAX_DIMENSIONS = 2;
        return (this.props.query.query.breakout.length < MAX_DIMENSIONS);
    },

    hasValidBreakout: function() {
        return (this.props.query.query.breakout &&
                    this.props.query.query.breakout.length > 0 &&
                    this.props.query.query.breakout[0] !== null);
    },

    canSortByAggregateField: function() {
        var SORTABLE_AGGREGATION_TYPES = new Set(["avg", "count", "distinct", "stddev", "sum"]);

        return this.hasValidBreakout() && SORTABLE_AGGREGATION_TYPES.has(this.props.query.query.aggregation[0]);
    },

    addDimension: function() {
        var query = this.props.query;
        query.query.breakout.push(null);

        this.setQuery(query, true);
    },

    updateDimension: function(dimension, index) {
        var query = this.props.query;
        query.query.breakout[index] = dimension;

        this.setQuery(query, true);
    },

    removeDimension: function(index) {
        // TODO: when we remove breakouts we also need to remove any limits/sorts that don't make sense
        var query = this.props.query;
        query.query.breakout.splice(index, 1);

        this.setQuery(query, true);
    },

    hasEmptyAggregation: function() {
        var aggregation = this.props.query.query.aggregation;
        if (aggregation !== undefined &&
                aggregation.length > 0 &&
                aggregation[0] !== null) {
            return false;
        }
        return true;
    },

    hasValidAggregation: function() {
        var aggregation = this.props.query.query.aggregation;
        if (aggregation !== undefined &&
                ((aggregation.length === 1 && aggregation[0] !== null) ||
                 (aggregation.length === 2 && aggregation[0] !== null && aggregation[1] !== null))) {
            return true;
        }
        return false;
    },

    isBareRowsAggregation: function() {
        return (this.props.query.query.aggregation &&
                    this.props.query.query.aggregation.length > 0 &&
                    this.props.query.query.aggregation[0] === "rows");
    },

    updateAggregation: function(aggregationClause) {
        var query = this.props.query;
        query.query.aggregation = aggregationClause;

        // for "rows" type aggregation we always clear out any dimensions because they don't make sense
        if (aggregationClause.length > 0 && aggregationClause[0] === "rows") {
            query.query.breakout = [];
        }

        this.setQuery(query, true);
    },

    getFilters: function() {
        // Special handling for accessing query filters because it's been fairly complex to deal with their structure.
        // This method provide a unified and consistent view of the filter definition for the rest of the tool to use.

        var queryFilters = this.props.query.query.filter;

        // quick check for older style filter definitions and tweak them to a format we want to work with
        if (queryFilters && queryFilters.length > 0 && queryFilters[0] !== "AND") {
            var reformattedFilters = [];

            for (var i=0; i < queryFilters.length; i++) {
                if (queryFilters[i] !== null) {
                    reformattedFilters = ["AND", queryFilters];
                    break;
                }
            }

            queryFilters = reformattedFilters;
        }

        return queryFilters;
    },

    canAddFilter: function(queryFilters) {
        var canAdd = true;

        if (queryFilters && queryFilters.length > 0) {
            var lastFilter = queryFilters[queryFilters.length - 1];

            // simply make sure that there are no null values in the last filter
            for (var i=0; i < lastFilter.length; i++) {
                if (lastFilter[i] === null) {
                    canAdd = false;
                }
            }
        } else {
            canAdd = false;
        }

        return canAdd;
    },

    addFilter: function() {
        var query = this.props.query,
            queryFilters = this.getFilters();

        if (queryFilters.length === 0) {
            queryFilters = ["AND", [null, null, null]];
        } else {
            queryFilters.push([null, null, null]);
        }

        query.query.filter = queryFilters;
        this.setQuery(query, true);
    },

    updateFilter: function(index, filter) {
        var query = this.props.query,
            queryFilters = this.getFilters();

        queryFilters[index] = filter;

        query.query.filter = queryFilters;
        this.setQuery(query, true);
    },

    removeFilter: function(index) {
        var query = this.props.query,
            queryFilters = this.getFilters();

        if (queryFilters.length === 2) {
            // this equates to having a single filter because the arry looks like ... ["AND" [a filter def array]]
            queryFilters = [];
        } else {
            queryFilters.splice(index, 1);
        }

        query.query.filter = queryFilters;
        this.setQuery(query, true);
    },

    canAddLimitAndSort: function() {
        // limits and sorts only make sense if we know there will be multiple rows
        var query = this.props.query;

        if (this.isBareRowsAggregation()) {
            return true;
        } else if (this.hasValidBreakout()) {
            return true;
        } else {
            return false;
        }
    },

    getSortableFields: function() {
        // in bare rows all fields are sortable, otherwise we only sort by our breakout columns
        var query = this.props.query;

        // start with all fields
        var fieldList = [];
        for(var key in this.state.options.fields_lookup) {
            fieldList.push(this.state.options.fields_lookup[key]);
        }

        if (this.isBareRowsAggregation()) {
            return fieldList;
        } else if (this.hasValidBreakout()) {
            // further filter field list down to only fields in our breakout clause
            var breakoutFieldList = [];
            this.props.query.query.breakout.map(function (breakoutFieldId) {
                for (var idx in fieldList) {
                    if (fieldList[idx].id === breakoutFieldId) {
                        breakoutFieldList.push(fieldList[idx]);
                    }
                }
            }.bind(this));

            if (this.canSortByAggregateField()) {
                breakoutFieldList.push({
                    id: ["aggregation",  0],
                    name: this.props.query.query.aggregation[0] // e.g. "sum"
                });
            }

            return breakoutFieldList;
        } else {
            return [];
        }
    },

    addLimit: function() {
        var query = this.props.query;
        query.query.limit = null;
        this.setQuery(query, true);
    },

    updateLimit: function(limit) {
        var query = this.props.query;
        query.query.limit = limit;
        this.setQuery(query, true);
    },

    removeLimit: function() {
        var query = this.props.query;
        delete query.query.limit;
        this.setQuery(query, true);
    },

    canAddSort: function() {
        // TODO: allow for multiple sorting choices
        return false;
    },

    addSort: function() {
        // TODO: make sure people don't try to sort by the same field multiple times
        var query = this.props.query,
            order_by = query.query.order_by;

        if (!order_by) {
            order_by = [];
        }

        order_by.push([null, "ascending"]);
        query.query.order_by = order_by;

        this.setQuery(query, true);
    },

    updateSort: function(index, sort) {
        var query = this.props.query;
        query.query.order_by[index] = sort;
        this.setQuery(query, true);
    },

    removeSort: function(index) {
        var query = this.props.query,
            queryOrderBy = query.query.order_by;

        if (queryOrderBy.length === 1) {
            delete query.query.order_by;
        } else {
            queryOrderBy.splice(index, 1);
        }

        this.setQuery(query, true);
    },

    renderDbSelector: function() {
        if(this.props.databases && this.props.databases.length > 1) {
            return (
                <div className={this.props.querySectionClasses}>
                    <span className="Query-label">Using:</span>
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
        if (this.state.tables) {
            var sourceTableListOpen = true;
            if(this.props.query.query.source_table) {
                sourceTableListOpen = false;
            }

            // if we don't have any filters applied yet then provide an option to do that


            return (
                <div className={this.props.querySectionClasses}>
                    <span className="Query-label">From:</span>
                    <SelectionModule
                        placeholder="What part of your data?"
                        items={this.state.tables}
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
                this.getFilters().length === 0 &&
                this.state.options &&
                this.state.options.fields.length > 0) {
            return (
                <a className="ml2" onClick={this.addFilter}>
                    <Icon name='filter' width={16} height={ 16} viewBox='0 0 16 16' />
                    Filter {(this.state.options) ? this.state.options.name : ""}
                </a>
            );
        }
    },

    renderBreakouts: function() {
        // breakout clause.  must have table details available & a valid aggregation defined
        if (this.state.options &&
                this.state.options.breakout_options.fields.length > 0 &&
                !this.hasEmptyAggregation()) {

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
            if(this.state.options.breakout_options) {
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
                                items={this.state.options.breakout_options.fields}
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
                    <a className="QuerySection-addTrigger" onClick={this.addDimension}>Add a grouping</a>
                );
            } else if (this.props.query.query.breakout.length === 1 &&
                            this.props.query.query.breakout[0] !== null) {
                addBreakoutButton = (
                    <a className="ml2" onClick={this.addDimension}>Add another grouping</a>
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
        if(this.state.options) {
            return (
                <AggregationWidget
                    aggregation={this.props.query.query.aggregation}
                    aggregationOptions={this.state.options.aggregation_options}
                    updateAggregation={this.updateAggregation}>
                </AggregationWidget>
            );
        }
    },

    renderFilterSelector: function() {
        var queryFilters = this.getFilters();

        if (this.state.options && queryFilters && queryFilters.length > 0) {
            var component = this;

            var filterFieldList = [];
            for(var key in this.state.options.fields_lookup) {
                filterFieldList.push(this.state.options.fields_lookup[key]);
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
            if (this.canAddFilter(queryFilters)) {
                addFilterButton = (
                    <a onClick={this.addFilter}>Add another filter</a>
                );
            }

            return (
                <div className={this.props.querySectionClasses}>
                    <span className="Query-label">Filtered by:</span>
                    <div className="Query-filters">
                        <ReactCSSTransitionGroup className="flex" transitionName="Transition-qb-section">
                        {filterList}
                        </ReactCSSTransitionGroup>
                        <ReactCSSTransitionGroup transitionName="Transition-qb-section">
                            {addFilterButton}
                        </ReactCSSTransitionGroup>
                    </div>
                </div>
            );
        }

    },

    renderLimitAndSort: function() {
        if (this.state.options && !this.hasEmptyAggregation() &&
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
                    <div className="flex align-center">
                        <a onClick={this.addLimit}>Add row limit</a>
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
                    <div className="flex align-center">
                        <a onClick={this.addSort}>Add sort</a>
                    </div>
                );
            } else {
                var addSortButton;
                if (this.canAddSort()) {
                    addSortButton = (
                        <a onClick={this.addSort}>Add another sort</a>
                    );
                }

                sortSection = (
                    <div className="flex align-center">
                        <span className="mx2">sorted by</span>
                        {sortList}
                        {addSortButton}
                    </div>
                );
            }

            return (
                <div className={this.props.querySectionClasses}>
                    <span className="Query-label">Limit and sort:</span>
                    <div className="Query-filters">
                        <ReactCSSTransitionGroup className="flex" transitionName="Transition-qb-section">
                            {limitSection}
                        </ReactCSSTransitionGroup>

                        <ReactCSSTransitionGroup transitionName="Transition-qb-section">
                            {sortSection}
                        </ReactCSSTransitionGroup>
                    </div>
                </div>
            );

        } else if (this.canAddLimitAndSort()) {
            return (
                <div className={this.props.querySectionClasses}>
                    <a className="QuerySection-addTrigger my2" onClick={this.addLimit}>
                        Set row limits and sorting
                    </a>
                </div>
            );
        }

    },

    toggleOpen: function() {
        var newOpenValue = !this.state.isOpen;
        this.setState({
            isOpen: newOpenValue
        });
    },

    toggleText: function() {
        return (this.state.isOpen) ? 'Hide query' : 'Show query';
    },

    toggleIcon: function () {
        if(this.state.isOpen) {
            return (
                <Icon name='expand' width="16px" height="16px" />
            );
        } else {
            return (
                <Icon name='expand' width="16px" height="16px" />
            );
        }
    },

    openStatus: function() {
        return (
            <a href="#" className="QueryToggle flex align-center" onClick={this.toggleOpen}>
                {this.toggleIcon()}
                {this.toggleText()}
            </a>
        );
    },

    render: function() {
        var guiBuilderClasses = cx({
            'GuiBuilder': true,
            'GuiBuilder--collapsed': !this.state.isOpen,
        });
        return (
            <div className={guiBuilderClasses}>
                {this.openStatus()}
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
            </div>
        );
    }
});
