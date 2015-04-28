'use strict';
/*global SelectionModule, DatabaseSelector*/

// clearVisualizationFn
var Transition = React.addons.CSSTransitionGroup;

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
            options: null
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
        // check if this is the same db or not
        if (databaseId !== this.props.query.database) {
            // reset to a brand new query
            // TODO: clone?
            var query = this.props.defaultQuery;

            // set our new database on the query
            query.database = databaseId;

            // clear all previous state
            this.replaceState({});

            // notify parent that we've started over
            this.props.notifyQueryModifiedFn(query);

            // load rest of the data we need
            this.loadDatabaseInfo(databaseId);
        }
    },
    setSourceTable: function(sourceTable) {
        // this will either be the id or an object with an id
        var tableId = sourceTable.id || sourceTable;
        this.loadTableInfo(tableId);

        var query = this.props.query;
        query.query.source_table = tableId;

        this.setQuery(query, true);
    },
    canRun: function() {
        var canRun = false;
        if (this.aggregationComplete()) {
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
    aggregationComplete: function() {
        var aggregationComplete = false;
        if ((this.props.query.query.aggregation[0] !== null) &&
            (this.props.query.query.aggregation[1] !== null)) {
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
    addFilter: function() {
        var query = this.props.query,
            queryFilters = query.query.filter;

        var pushFilterTemplate = function(index) {
            if (index) {
                queryFilters[index] = [null, null, null];
            } else {
                queryFilters.push(null, null, null);
            }
        }

        // this gets run the second time you click the add filter button
        if (queryFilters.length === 3 && queryFilters[0] !== "AND") {
            var newFilters = [];
            newFilters.push(queryFilters);
            newFilters.unshift('AND');
            newFilters.push([null, null, null]);
            query.query.filter = newFilters;
        } else if (queryFilters[0] === 'AND') {
            pushFilterTemplate(queryFilters.length);
        } else {
            pushFilterTemplate();
        }

        this.setQuery(query, true);
    },
    updateFilter: function(value, index, filterListIndex) {
        var query = this.props.query,
            queryFilters = query.query.filter;

        if (filterListIndex) {
            queryFilters[filterListIndex][index] = value;
        } else {
            queryFilters[index] = value;
        }

        this.setQuery(query, true);
    },
    removeFilter: function(index) {
        var query = this.props.query,
            queryFilters = query.query.filter;

        /*
            HERE BE MORE DRAGONS

            1.) if there are 3 values and the first isn't AND, this means we only ever had one "filter", so reset to []
            instead of slicing off individual elements

            2.) if the first value is AND and there are only two values in the array, then we're about to remove the last filter after
            having added multiple so we should reset to [] in this case as well
        */

        if ((queryFilters.length === 3 && queryFilters[0] !== 'AND') || (queryFilters[0] === 'AND' && queryFilters.length === 2)) {
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
    renderDbSelector: function () {
        if(this.props.databases && this.props.databases.length > 1) {
            return (
                <div className="flex align-center">
                    Using:
                    <DatabaseSelector
                        databases={this.props.databases}
                        setDatabase={this.setDatabase}
                        currentDatabaseId={this.props.query.database}
                    />
                </div>
            );
        }
    },
    renderTableSelector: function () {
        if (this.state.tables) {
            var sourceTableListOpen = true;
            if(this.props.query.query.source_table) {
                sourceTableListOpen = false;
            }

            // if we don't have any filters applied yet then provide an option to do that


            return (
                <div className="flex align-center">
                    From:
                    <SelectionModule
                        placeholder="What part of your data?"
                        items={this.state.tables}
                        display="name"
                        selectedValue={this.props.query.query.source_table}
                        selectedKey="id"
                        isInitiallyOpen={sourceTableListOpen}
                        action={this.setSourceTable}
                    />
                    {this.renderFilterButton()}
                </div>
            );
        }
    },
    renderFilterButton: function () {
        if (this.props.query.query.source_table && this.props.query.query.filter.length === 0) {
            return (
                <a className="FilterTrigger Button" onClick={this.addFilter}>
                    <svg className="icon" width="16px" height="16px" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M6.57883011,7.57952565 L1.18660637e-12,-4.86721774e-13 L16,-4.92050845e-13 L9.42116989,7.57952565 L9.42116989,13.5542169 L6.57883011,15 L6.57883011,7.57952565 Z"></path>
                    </svg>
                </a>
            );
        }
    },
    renderBreakouts: function () {
        // breakout clause.  must have table details available & a valid aggregation defined
        if (this.state.options &&
                this.state.options.breakout_options.fields.length > 0 &&
                this.aggregationComplete()) {

            // only render a label for our breakout if we have a valid breakout clause already
            var breakoutLabel;
            if(this.props.query.query.breakout.length > 0) {
                breakoutLabel = (
                    <div className="inline-block">
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
                        <div className="DimensionList inline-block">
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
                    <a className="Button" onClick={this.addDimension}>Add a grouping ...</a>
                );
            } else if (this.props.query.query.breakout.length === 1 &&
                            this.props.query.query.breakout[0] !== null) {
                addBreakoutButton = (
                    <a className="Button" onClick={this.addDimension}>Add another grouping</a>
                );
            }

            return (
                <div className="flex">
                    {breakoutLabel}
                    {breakoutList}
                    {addBreakoutButton}
                </div>
            );
        }
    },
    renderAggregation: function () {
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
                    <div className="inline-block">
                        of
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
                <div className="flex align-center">
                    I want to see:
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
    renderFilterSelector: function () {
        if (this.state.options && this.props.query.query.filter.length > 0) {
            var component = this;

            var filterFieldList = [];
            for(var key in this.state.options.fields_lookup) {
                filterFieldList.push(this.state.options.fields_lookup[key]);
            }

            var filterWidget = function (filter, index) {
                var operator = filter[0],           // name of the operator
                    field = filter[1],              // id of the field
                    value = filter[2],              // filtering value
                    operatorList = [],
                    valueFields;

                // extract the real info
                for(var fieldItem in filterFieldList) {
                    var theField = filterFieldList[fieldItem];
                    if(theField.id === field) {
                        for(var operatorItem in theField.operators_lookup) {
                            var theOperator = theField.operators_lookup[operatorItem]
                            // push the operator into the list we'll use for selection
                            operatorList.push(theOperator);

                            if(theOperator.name === operator) {
                                // this is structured strangely
                                valueFields = theOperator.fields[0];
                            }
                        }
                    }
                }

                return (
                    <FilterWidget
                        placeholder="Item"
                        field={field}
                        filterFieldList={filterFieldList}
                        operator={operator}
                        operatorList={operatorList}
                        value={value}
                        valueFields={valueFields}
                        index={index}
                        remove={component.removeFilter}
                        updateFilter={component.updateFilter}
                    />
                );
            };

            var filterList;
            if(this.props.query.query.filter[0] === "AND") {
                filterList = this.props.query.query.filter.map(function (filter, index) {
                    if(filter === "AND") {
                        return;
                    } else {
                        return (
                            filterWidget(filter, index)
                        );
                    }
                }.bind(this));
            } else {
                filterList = filterWidget(this.props.query.query.filter, 0);
            }

            var lastFilter;
            if (this.props.query.query.filter[0] === "AND") {
                lastFilter = this.props.query.query.filter[this.props.query.query.filter.length - 1];
            } else {
                lastFilter = this.props.query.query.filter;
            }

            var addFilterButton;
            if (lastFilter.length === 3 &&
                    lastFilter[0] !== null &&
                    lastFilter[1] !== null &&
                    lastFilter[2] !== null) {
                addFilterButton = (
                    <a className="FilterTrigger Button" onClick={this.addFilter}>Add another filter ...</a>
                );
            }

            return (
                <div className="flex align-center">
                    Filtered by:
                    {filterList}
                    {addFilterButton}
                </div>
            );
        }

    },
    render: function () {
        return (
            <div className="border-bottom">
                <Transition>
                    {this.renderDbSelector()}
                </Transition>
                <Transition>
                    {this.renderTableSelector()}
                </Transition>
                <Transition>
                    {this.renderFilterSelector()}
                </Transition>
                <Transition>
                    {this.renderAggregation()}
                </Transition>
                <Transition>
                    {this.renderBreakouts()}
                </Transition>
                <RunButton
                    canRun={this.canRun()}
                    isRunning={this.props.isRunning}
                    runFn={this.runQuery}
                />
            </div>
        );
    }
});
