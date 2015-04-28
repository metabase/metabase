'use strict';
/*global SelectionModule, DatabaseSelector*/

// clearVisualizationFn

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
        var filter = queryBuilder.card.dataset_query.query.filter,
            filterLength = filter.length;

        // this gets run the second time you click the add filter button
        if (filterLength === 3 && filter[0] !== 'AND') {
            var newFilters = [];
            newFilters.push(filter);
            newFilters.unshift('AND');
            newFilters.push([null, null, null]);
            queryBuilder.card.dataset_query.query.filter = newFilters;
            queryBuilder.inform();
        } else if (filter[0] === 'AND') {
            pushFilterTemplate(filterLength);
            queryBuilder.inform();
        } else {
            pushFilterTemplate();
            queryBuilder.inform();
        }

        function pushFilterTemplate(index) {
            if (index) {
                filter[index] = [null, null, null];
            } else {
                filter.push(null, null, null);
            }
        }
    },
    updateFilter: function(value, index, filterListIndex) {
        var filters = queryBuilder.card.dataset_query.query.filter;
        if (filterListIndex) {
            filters[filterListIndex][index] = value;
        } else {
            filters[index] = value;
        }

        queryBuilder.inform();
    },
    removeFilter: function(index) {
        var filters = queryBuilder.card.dataset_query.query.filter;

        /*
            HERE BE MORE DRAGONS

            1.) if there are 3 values and the first isn't AND, this means we only ever had one "filter", so reset to []
            instead of slicing off individual elements

            2.) if the first value is AND and there are only two values in the array, then we're about to remove the last filter after
            having added multiple so we should reset to [] in this case as well
        */

        if ((filters.length === 3 && filters[0] !== 'AND') || (filters[0] === 'AND' && filters.length === 2)) {
            // just reset the array
            queryBuilder.card.dataset_query.query.filter = [];
        } else {
            queryBuilder.card.dataset_query.query.filter.splice(index, 1);
        }
        queryBuilder.inform();
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
    _getFilterFields: function () {
        var filterFieldList = [];
        if(this.state.options) {
            for(var key in this.state.options.fields_lookup) {
                filterFieldList.push(this.state.options.fields_lookup[key]);
            }
        }
        return filterFieldList;
    },
    _getFilterWidget: function (filter, index) {
        var operator = filter[0], // name of the operator
            field = filter[1], // id of the field
            value = filter[2],

            operatorList = [],
            valueFields,
            filterFieldList = this._getFilterFields();

        // extract the real info
        for(var fieldItem in filterFieldList) {
            var theField = filterFieldList[fieldItem];

            if(theField.id == field) {

                for(var operatorItem in theField.operators_lookup) {
                    var theOperator = theField.operators_lookup[operatorItem]
                    // push the operator into the list we'll use for selection
                    operatorList.push(theOperator);

                    if(theOperator.name == operator) {
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
                index={index || 0}
                remove={this.removeFilter}
                updateFilter={this.updateFilter}
            />
        );
    },
    render: function () {

        /* @souce table */
        var sourceTableSelection = this.props.query.query.source_table,
            sourceTableListOpen = true;

        if(sourceTableSelection) {
            sourceTableListOpen = false;
        }

        /* @aggregation table */
        var aggregationSelectionHtml,
            aggregationSelection = this.props.query.query.aggregation[0],
            aggregationListOpen = true;

        if(aggregationSelection) {
            aggregationListOpen = false;
        }

        /* @aggregation target */
        var aggregationTargetHtml,
            aggregationTargetListOpen = true;

        var dimensionList,
            addDimensionButton,
            addDimensionButtonText;

        var dbSelector;
        if(this.props.databases && this.props.databases.length > 1) {
            dbSelector = (
                <DatabaseSelector
                    databases={this.props.databases}
                    setDatabase={this.setDatabase}
                    currentDatabaseId={this.props.query.database}
                />
            );
        }


        if (this.aggregationComplete() &&
            this.state.options &&
            this.state.options.breakout_options.fields.length > 0) {

            addDimensionButtonText = (this.props.query.query.breakout.length < 1) ? "Grouped by" : "and";

            if(this.props.query.query.breakout.length < 2) {
                addDimensionButton = (
                    <a className="Button" onClick={this.addDimension}>{addDimensionButtonText}</a>
                );
            }

            if(this.state.options.breakout_options) {
                dimensionList = this.props.query.query.breakout.map(function (breakout, index) {
                        var  open;
                        if(breakout === null) {
                            open = true;
                        }

                        return (
                            <div className="DimensionList inline-block">
                                <SelectionModule
                                    placeholder='What part of your data?'
                                    display='1'
                                    items={this.state.options.breakout_options.fields}
                                    selectedValue={breakout}
                                    selectedKey='0'
                                    index={index}
                                    isInitiallyOpen={open}
                                    action={this.updateDimension}
                                    remove={this.removeDimension}
                                />
                            </div>
                        );
                }.bind(this));
            }
        }

        var dimensionLabel;

        if(this.props.query.query.breakout.length > 0) {
            dimensionLabel = (
                <div className="text-grey-3 inline-block mx2">
                    Grouped by:
                </div>
            );
        }


        if(this.state.options) {
            aggregationSelectionHtml = (
                <SelectionModule
                    placeholder='And I want to see...'
                    items={this.state.options.aggregation_options}
                    display='name'
                    selectedValue={aggregationSelection}
                    selectedKey='short'
                    isInitiallyOpen={aggregationListOpen}
                    action={this.setAggregation}
                />
            );

            // if there's a value in the second aggregation slot
            if(this.props.query.query.aggregation.length > 1) {
                if(this.props.query.query.aggregation[1] !== null) {
                    aggregationTargetListOpen = false;
                }
                aggregationTargetHtml = (
                    <SelectionModule
                        placeholder='field named...'
                        items={this.getAggregationFields(this.props.query.query.aggregation[0])}
                        display='1'
                        selectedValue={this.props.query.query.aggregation[1]}
                        selectedKey='0'
                        isInitiallyOpen={aggregationTargetListOpen}
                        action={this.setAggregationTarget}
                    />
                );
            }
        }

        var querySelection;
        // tables are provided if we have a selected database
        if(this.state.tables) {
            querySelection = (
                <div>
                    <div className="Metric-sourceTable inline-block">
                        <SelectionModule
                            placeholder='Lets start with...'
                            items={this.state.tables}
                            display='name'
                            selectedValue={this.props.query.query.source_table}
                            selectedKey='id'
                            isInitiallyOpen={sourceTableListOpen}
                            action={this.setSourceTable}
                        />
                    </div>

                    <div className="inline-block mx2">
                        {aggregationSelectionHtml}
                        {aggregationTargetHtml}
                    </div>
                    {dimensionLabel}
                    {dimensionList}
                    {addDimensionButton}
                </div>
            );
        }

        //  FILTERS
        var filterList,
            filterHtml;

        // if we have filters...
        var filters = this.props.query.query.filter;
        if(filters.length != 0) {
            // and if we have multiple filters, map through and return a filter widget
            if(filters[0] == 'AND') {
                filterList = filters.map(function (filter, index) {
                    if(filter == 'AND') {
                        return
                    } else {
                        return (
                            this._getFilterWidget(filter, index)
                        )
                    }
                }.bind(this))
            } else {
                filterList = this._getFilterWidget(filters)
            }
        }

        filterHtml = (
            <div className="clearfix">
                <a className="FilterTrigger float-left Button inline-block mr4" onClick={this.addFilter}>
                    <svg className="icon" width="16px" height="16px" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M6.57883011,7.57952565 L1.18660637e-12,-4.86721774e-13 L16,-4.92050845e-13 L9.42116989,7.57952565 L9.42116989,13.5542169 L6.57883011,15 L6.57883011,7.57952565 Z"></path>
                    </svg>
                </a>
                {filterList}
            </div>
        );

        return (
            <div>
                <div className="QueryBar">
                    <div className="inline-block">
                        {dbSelector}
                    </div>
                    <div className="inline-block">
                        {querySelection}
                    </div>
                </div>
                <div className="QueryBar">
                    {filterHtml}
                </div>
                <div>
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
