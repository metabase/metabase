'use strict';
/*global DateFilter, SelectionModule, CloseIcon*/

var AggregationWidget = React.createClass({
    displayName: 'AggregationWidget',
    propTypes: {
        aggregation: React.PropTypes.array.isRequired,
        aggregationOptions: React.PropTypes.array.isRequired,
        updateAggregation: React.PropTypes.func.isRequired
    },

    getDefaultProps: function() {
        return {
            querySectionClasses: 'Query-section flex align-center'
        };
    },

    componentWillMount: function() {
        this.componentWillReceiveProps(this.props);
    },

    componentWillReceiveProps: function(newProps) {

        // build a list of aggregations that are valid, taking into account specifically if we have valid fields available
        var availableAggregations = [];
        var aggregationFields;
        for (var i=0; i < newProps.aggregationOptions.length; i++) {
            var option = newProps.aggregationOptions[i];

            if (option.fields &&
                    (option.fields.length === 0 ||
                        (option.fields.length > 0 && option.fields[0].length && option.fields[0].length > 0))) {
                availableAggregations.push(option);
            }

            if (newProps.aggregation.length > 0 &&
                    newProps.aggregation[0] !== null &&
                    option.short === newProps.aggregation[0]) {
                aggregationFields = option.fields[0];
            }
        }

        this.setState({
            availableAggregations: availableAggregations,
            aggregationFields: aggregationFields
        });
    },

    setAggregation: function(aggregation) {
        var queryAggregation = [aggregation];

        // check to see if this aggregation type requires another choice
        _.map(this.props.aggregationOptions, function (option) {
            if (option.short === aggregation &&
                option.fields.length > 0) {

                // extend aggregation array by 1
                queryAggregation[1] = null;
            }
        });

        this.props.updateAggregation(queryAggregation);
    },

    setAggregationTarget: function(target) {
        var queryAggregation = this.props.aggregation;
        queryAggregation[1] = target;

        this.props.updateAggregation(queryAggregation);
    },

    render: function() {
        if (this.props.aggregation.length === 0) {
            // we can't do anything without a valid aggregation
            return;
        }

        // aggregation clause.  must have table details available
        var aggregationListOpen = true;
        if(this.props.aggregation[0]) {
            aggregationListOpen = false;
        }

        // if there's a value in the second aggregation slot render another selector
        var aggregationTarget;
        if(this.props.aggregation.length > 1) {
            var aggregationTargetListOpen = true;
            if(this.props.aggregation[1] !== null) {
                aggregationTargetListOpen = false;
            }

            aggregationTarget = (
                <div className="flex align-center">
                    <span className="mx2">of</span>
                    <SelectionModule
                        placeholder="What attribute?"
                        items={this.state.aggregationFields}
                        display="1"
                        selectedValue={this.props.aggregation[1]}
                        selectedKey="0"
                        isInitiallyOpen={aggregationTargetListOpen}
                        action={this.setAggregationTarget}
                    />
                </div>
            );
        }

        return (
            <div className={this.props.querySectionClasses}>
                <span className="Query-label">I want to see:</span>
                <SelectionModule
                    placeholder="What data?"
                    items={this.state.availableAggregations}
                    display="name"
                    selectedValue={this.props.aggregation[0]}
                    selectedKey="short"
                    isInitiallyOpen={aggregationListOpen}
                    action={this.setAggregation}
                />
                {aggregationTarget}
            </div>
        );
    }
});
