'use strict';
/*global SelectionModule, DatabaseSelector*/

var GuiQueryEditor = React.createClass({
    displayName: 'GuiQueryEditor',
    propTypes: {
        addDimension: React.PropTypes.func.isRequired,
        aggregationComplete: React.PropTypes.func,
        options: React.PropTypes.object,
        query: React.PropTypes.object,
        removeDimension: React.PropTypes.func.isRequired,
        setAggregation: React.PropTypes.func.isRequired,
        setAggregationTarget: React.PropTypes.func.isRequired,
        setDatabase: React.PropTypes.func,
        tables: React.PropTypes.array,
        updateDimension: React.PropTypes.func.isRequired,
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

            </div>
        );
    }
});
