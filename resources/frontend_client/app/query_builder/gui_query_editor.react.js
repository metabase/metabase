'use strict';
/*global SelectionModule, DatabaseSelector*/

var GuiQueryEditor = React.createClass({
    displayName: 'GuiQueryEditor',
    propTypes: {
        query: React.PropTypes.object,
        options: React.PropTypes.object,
        tables: React.PropTypes.array,
        selected_table_fields: React.PropTypes.object,
        setDatabase: React.PropTypes.func,
        addDimension: React.PropTypes.func.isRequired,
        updateDimension: React.PropTypes.func.isRequired,
        removeDimension: React.PropTypes.func.isRequired,
        setAggregation: React.PropTypes.func.isRequired,
        setAggregationTarget: React.PropTypes.func.isRequired,
        aggregationComplete: React.PropTypes.func,
        addFilter: React.PropTypes.func.isRequired,
        updateFilter: React.PropTypes.func.isRequired,
        removeFilter: React.PropTypes.func.isRequired,
        canRun: React.PropTypes.bool,
        isRunning: React.PropTypes.bool,
        runFn: React.PropTypes.func.isRequired
    },
    _getFilterFields: function () {
        var filterFieldList = [];
        if(this.props.selected_table_fields) {
            for(var key in this.props.selected_table_fields.fields_lookup) {
                filterFieldList.push(this.props.selected_table_fields.fields_lookup[key]);
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
                remove={this.props.removeFilter}
                updateFilter={this.props.updateFilter}
            />
        );
    },
    render: function () {

        /* @souce table */
        var sourceTableSelection = this.props.query.source_table,
            sourceTableListOpen = true;

        if(sourceTableSelection) {
            sourceTableListOpen = false;
        }

        /* @aggregation table */
        var aggregationSelectionHtml,
            aggregationSelection = this.props.query.aggregation[0],
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

        if(this.props.aggregationComplete() && this.props.options.breakout_options.fields.length > 0) {

            addDimensionButtonText = (this.props.query.breakout.length < 1) ? "Grouped by" : "and";

            if(this.props.query.breakout.length < 2) {
                addDimensionButton = (
                    <a className="Button" onClick={this.props.addDimension}>{addDimensionButtonText}</a>
                );
            }

            if(this.props.options.breakout_options) {
                dimensionList = this.props.query.breakout.map(function (breakout, index) {
                        var  open;
                        if(breakout === null) {
                            open = true;
                        }

                        return (
                            <div className="DimensionList inline-block">
                                <SelectionModule
                                    placeholder='What part of your data?'
                                    display='1'
                                    items={this.props.options.breakout_options.fields}
                                    selectedValue={breakout}
                                    selectedKey='0'
                                    index={index}
                                    isInitiallyOpen={open}
                                    action={this.props.updateDimension}
                                    remove={this.props.removeDimension}
                                />
                            </div>
                        );
                }.bind(this));
            }
        }

        var dimensionLabel;

        if(this.props.query.breakout.length > 0) {
            dimensionLabel = (
                <div className="text-grey-3 inline-block mx2">
                    Grouped by:
                </div>
            );
        }


        if(this.props.options) {
            aggregationSelectionHtml = (
                <SelectionModule
                    placeholder='And I want to see...'
                    items={this.props.options.aggregation_options}
                    display='name'
                    selectedValue={aggregationSelection}
                    selectedKey='short'
                    isInitiallyOpen={aggregationListOpen}
                    action={this.props.setAggregation}
                />
            );

            // if there's a value in the second aggregation slot
            if(this.props.query.aggregation.length > 1) {
                if(this.props.query.aggregation[1] !== null) {
                    aggregationTargetListOpen = false;
                }
                aggregationTargetHtml = (
                    <SelectionModule
                        placeholder='field named...'
                        items={this.props.aggregationFieldList[0]}
                        display='1'
                        selectedValue={this.props.query.aggregation[1]}
                        selectedKey='0'
                        isInitiallyOpen={aggregationTargetListOpen}
                        action={this.props.setAggregationTarget}
                    />
                );
            }
        }

        var querySelection;
        // tables are provided if we have a selected database
        if(this.props.tables) {
            querySelection = (
                <div>
                    <div className="Metric-sourceTable inline-block">
                        <SelectionModule
                            placeholder='Lets start with...'
                            items={this.props.tables}
                            display='name'
                            selectedValue={this.props.query.source_table}
                            selectedKey='id'
                            isInitiallyOpen={sourceTableListOpen}
                            action={this.props.setSourceTable}
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

        var dbSelector;
        if(this.props.dbList && this.props.dbList.length > 1) {
            dbSelector = (
                <DatabaseSelector
                    databases={this.props.dbList}
                    setDatabase={this.props.setDatabase}
                    currentDatabaseId={this.props.db}
                />
            );
        }

        //  FILTERS
        var filterList,
            filterHtml;

        // if we have filters...
        var filters = this.props.query.filter;
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
                <a className="FilterTrigger float-left Button inline-block mr4" onClick={this.props.addFilter.bind(this)}>
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
                        canRun={this.props.canRun}
                        isRunning={this.props.isRunning}
                        runFn={this.props.runFn}
                    />
                </div>
            </div>
        );
    }
});
