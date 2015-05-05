'use strict';
/*global _, cx, FilterWidget, RunButton, SelectionModule, DatabaseSelector*/

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
    querySectionClasses: 'Query-section flex align-center',

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
            this.replaceState({});

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
        // ewwwww.  we should do something better here
        var cleanQuery = this.cleanFilters(this.props.query);

        this.props.runFn(cleanQuery);

        // TODO: isRunning / hasJustRun state
    },

    canAddDimensions: function() {
        var MAX_DIMENSIONS = 2;
        return (this.props.query.query.breakout.length < MAX_DIMENSIONS);
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
        var query = this.props.query;
        query.query.breakout.splice(index, 1);

        this.setQuery(query, true);
    },

    hasValidAggregation: function() {
        var aggregationComplete = false;
        if (this.props.query.query.aggregation !== undefined &&
            this.props.query.query.aggregation[0] !== null &&
            this.props.query.query.aggregation[1] !== null) {
            aggregationComplete = true;
        }
        return aggregationComplete;
    },

    getAggregationFields: function(aggregation) {

        for (var i=0; i < this.state.options.aggregation_options.length; i++) {
            var option = this.state.options.aggregation_options[i];
            if (option.short === aggregation) {
                // not exactly sure why we need the first element instead of option.fields??
                return option.fields[0];
            }
        }
    },

    setAggregation: function(aggregation) {
        var query = this.props.query,
            queryAggregation = [aggregation];

        query.query.aggregation = queryAggregation;

        // for "rows" type aggregation we always clear out any dimensions because they don't make sense
        if (aggregation === "rows") {
            query.query.breakout = [];
        }

        // check to see if this aggregation type requires another choice
        _.map(this.state.options.aggregation_options, function (option) {
            if (option.short === aggregation &&
                option.fields.length > 0) {

                // extend aggregation array by 1
                queryAggregation[1] = null;
            }
        });

        this.setQuery(query, true);
    },

    setAggregationTarget: function(target) {
        var query = this.props.query;
        query.query.aggregation[1] = target;

        this.setQuery(query, true);
    },

    canAddFilter: function() {
        var canAdd = true;

        var query = this.props.query;
        if (query.query.filter && query.query.filter.length > 0) {
            var lastFilter = query.query.filter[query.query.filter.length - 1];

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
            queryFilters = query.query.filter;

        if (queryFilters.length === 0) {
            query.query.filter = ["AND", [null, null, null]];
        } else {
            queryFilters.push([null, null, null]);
        }

        this.setQuery(query, true);
    },

    updateFilter: function(index, filter) {
        var query = this.props.query;
        query.query.filter[index] = filter;
        this.setQuery(query, true);
    },

    removeFilter: function(index) {
        var query = this.props.query,
            queryFilters = query.query.filter;

        if (queryFilters.length === 2) {
            query.query.filter = [];
        } else {
            queryFilters.splice(index, 1);
        }

        this.setQuery(query, true);
    },

    cleanFilters: function(dataset_query) {
        var filters = dataset_query.query.filter,
            cleanFilters = [];

        // in instances where there's only one filter, the api expects just one array with the values
        if (typeof(filters[0]) == 'object' && filters[0] != 'AND') {
            for (var filter in filters[0]) {
                cleanFilters.push(filters[0][filter]);
            }
            dataset_query.query.filter = cleanFilters;
        }

        // reset to initial state of filters if we've removed 'em all
        if (filters.length === 1 && filters[0] === 'AND') {
            dataset_query.filter = [];
        }

        return dataset_query;
    },

    renderDbSelector: function() {
        if(this.props.databases && this.props.databases.length > 1) {
            return (
                <div className={this.querySectionClasses}>
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
                <div className={this.querySectionClasses}>
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
        if (this.props.query.query.source_table && this.props.query.query.filter.length === 0) {
            return (
                <a className="ml2" onClick={this.addFilter}>
                    <svg className="icon" width="16px" height="16px" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M6.57883011,7.57952565 L1.18660637e-12,-4.86721774e-13 L16,-4.92050845e-13 L9.42116989,7.57952565 L9.42116989,13.5542169 L6.57883011,15 L6.57883011,7.57952565 Z"></path>
                    </svg>
                    Filter {this.props.query.source_table}
                </a>
            );
        }
    },

    renderBreakouts: function() {
        // breakout clause.  must have table details available & a valid aggregation defined
        if (this.state.options &&
                this.state.options.breakout_options.fields.length > 0 &&
                this.hasValidAggregation()) {

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
                    <a onClick={this.addDimension}>Add a grouping ...</a>
                );
            } else if (this.props.query.query.breakout.length === 1 &&
                            this.props.query.query.breakout[0] !== null) {
                addBreakoutButton = (
                    <a className="ml2" onClick={this.addDimension}>Add another grouping</a>
                );
            }

            return (
                <div className={this.querySectionClasses}>
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

            var aggregationListOpen = true;
            if(this.props.query.query.aggregation[0]) {
                aggregationListOpen = false;
            }

            // if there's a value in the second aggregation slot render another selector
            var aggregationTarget;
            if(this.props.query.query.aggregation.length > 1) {
                var aggregationTargetListOpen = true;
                if(this.props.query.query.aggregation[1] !== null) {
                    aggregationTargetListOpen = false;
                }

                aggregationTarget = (
                    <div className="flex align-center">
                        <span className="mx2">of</span>
                        <SelectionModule
                            placeholder="What attribute?"
                            items={this.getAggregationFields(this.props.query.query.aggregation[0])}
                            display="1"
                            selectedValue={this.props.query.query.aggregation[1]}
                            selectedKey="0"
                            isInitiallyOpen={aggregationTargetListOpen}
                            action={this.setAggregationTarget}
                        />
                    </div>
                );
            }

            return (
                <div className={this.querySectionClasses}>
                    <span className="Query-label">I want to see:</span>
                    <SelectionModule
                        placeholder="What data?"
                        items={this.state.options.aggregation_options}
                        display="name"
                        selectedValue={this.props.query.query.aggregation[0]}
                        selectedKey="short"
                        isInitiallyOpen={aggregationListOpen}
                        action={this.setAggregation}
                    />
                    {aggregationTarget}
                </div>
            );
        }
    },

    renderFilterSelector: function() {
        if (this.state.options && this.props.query.query.filter.length > 0) {
            var component = this;

            var filterFieldList = [];
            for(var key in this.state.options.fields_lookup) {
                filterFieldList.push(this.state.options.fields_lookup[key]);
            }

            var filterList = this.props.query.query.filter.map(function (filter, index) {
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
            if (this.canAddFilter()) {
                addFilterButton = (
                    <a onClick={this.addFilter}>Add another filter ...</a>
                );
            }

            return (
                <div className={this.querySectionClasses}>
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
                <ExpandIcon width="16px" height="16px" />
            )
        } else {
            return (
                <ExpandIcon width="16px" height="16px" />
            )
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
