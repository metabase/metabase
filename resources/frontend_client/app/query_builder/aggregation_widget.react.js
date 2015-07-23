'use strict';
/*global _ */

import SelectionModule from './selection_module.react';
import FieldWidget from './field_widget.react';

export default React.createClass({
    displayName: 'AggregationWidget',
    propTypes: {
        aggregation: React.PropTypes.array.isRequired,
        aggregationOptions: React.PropTypes.array.isRequired,
        updateAggregation: React.PropTypes.func.isRequired,
        tableName: React.PropTypes.string
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
                        (option.fields.length > 0 && option.fields[0]))) {
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
                    <span className="text-bold">of</span>
                    <FieldWidget
                        className="View-section-aggregation-target SelectionModule p1"
                        field={this.props.aggregation[1]}
                        fields={this.state.aggregationFields}
                        setField={this.setAggregationTarget}
                        tableName={this.props.tableName}
                        isInitiallyOpen={aggregationTargetListOpen}
                    />
                </div>
            );
        }

        return (
            <div className='Query-section'>
                <SelectionModule
                    className="View-section-aggregation"
                    placeholder="..."
                    items={this.state.availableAggregations}
                    display="name"
                    descriptionKey="description"
                    expandFilter={(item) => !item.advanced}
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
