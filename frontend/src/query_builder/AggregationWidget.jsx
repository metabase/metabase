import React, { Component, PropTypes } from "react";

import SelectionModule from './SelectionModule.jsx';
import FieldWidget from './FieldWidget.jsx';

import Query from "metabase/lib/query";

import _ from "underscore";

export default class AggregationWidget extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {};

        _.bindAll(this, "setAggregation", "setAggregationTarget");
    }

    static propTypes = {
        aggregation: PropTypes.array.isRequired,
        tableMetadata: PropTypes.object.isRequired,
        updateAggregation: PropTypes.func.isRequired
    };

    componentWillMount() {
        this.componentWillReceiveProps(this.props);
    }

    componentWillReceiveProps(newProps) {
        // build a list of aggregations that are valid, taking into account specifically if we have valid fields available
        var aggregationFieldOptions = [];
        var availableAggregations = [];
        newProps.tableMetadata.aggregation_options.forEach((option) => {
            if (option.fields &&
                    (option.fields.length === 0 ||
                        (option.fields.length > 0 && option.fields[0]))) {
                availableAggregations.push(option);
            }

            if (newProps.aggregation.length > 0 &&
                    newProps.aggregation[0] !== null &&
                    option.short === newProps.aggregation[0]) {
                // TODO: support multiple targets?
                aggregationFieldOptions = Query.getFieldOptions(newProps.tableMetadata.fields, true, option.validFieldsFilters[0]);
            }
        });

        this.setState({
            availableAggregations: availableAggregations,
            aggregationFieldOptions: aggregationFieldOptions
        });
    }

    setAggregation(aggregation) {
        var queryAggregation = [aggregation];

        // check to see if this aggregation type requires another choice
        _.map(this.props.tableMetadata.aggregation_options, function (option) {
            if (option.short === aggregation &&
                option.fields.length > 0) {

                // extend aggregation array by 1
                queryAggregation[1] = null;
            }
        });

        this.props.updateAggregation(queryAggregation);
    }

    setAggregationTarget(target) {
        var queryAggregation = this.props.aggregation;
        queryAggregation[1] = target;

        this.props.updateAggregation(queryAggregation);
    }

    render() {
        if (this.props.aggregation.length === 0) {
            // we can't do anything without a valid aggregation
            return;
        }

        // aggregation clause.  must have table details available
        var aggregationListOpen = this.props.aggregation[0] == null;

        // if there's a value in the second aggregation slot render another selector
        var aggregationTarget;
        if(this.props.aggregation.length > 1) {
            var aggregationTargetListOpen = this.props.aggregation[1] == null;

            aggregationTarget = (
                <div className="flex align-center">
                    <span className="text-bold">of</span>
                    <FieldWidget
                        color="green"
                        className="View-section-aggregation-target SelectionModule p1"
                        tableMetadata={this.props.tableMetadata}
                        field={this.props.aggregation[1]}
                        fieldOptions={this.state.aggregationFieldOptions}
                        setField={this.setAggregationTarget}
                        isInitiallyOpen={aggregationTargetListOpen}
                    />
                </div>
            );
        }

        return (
            <div className='Query-section Query-section-aggregation'>
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
}
