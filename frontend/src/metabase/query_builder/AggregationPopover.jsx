import React, { Component, PropTypes } from "react";

import AccordianList from "metabase/components/AccordianList.jsx";
import FieldList from './FieldList.jsx';
import QueryDefinitionTooltip from "./QueryDefinitionTooltip.jsx";

import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import Query from "metabase/lib/query";
import { AggregationClause } from "metabase/lib/query";

import _ from "underscore";


export default class AggregationPopover extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            aggregation: (props.isNew ? [] : props.aggregation),
            choosingField: (props.aggregation && props.aggregation.length > 1 && AggregationClause.isStandard(props.aggregation))
        };

        _.bindAll(this, "commitAggregation", "onPickAggregation", "onPickField", "onClearAggregation");
    }

    static propTypes = {
        isNew: PropTypes.bool,
        aggregation: PropTypes.array,
        availableAggregations: PropTypes.array.isRequired,
        onCommitAggregation: PropTypes.func.isRequired,
        onClose: PropTypes.func.isRequired,
        tableMetadata: PropTypes.object.isRequired,
        customFields: PropTypes.object
    };


    commitAggregation(aggregation) {
        this.props.onCommitAggregation(aggregation);
        this.props.onClose();
    }

    onPickAggregation(agg) {
        // check if this aggregation requires a field, if so then force user to pick that now, otherwise we are done
        if (agg.aggregation && agg.aggregation.requiresField) {
            this.setState({
                aggregation: agg.value,
                choosingField: true
            });
        } else {
            // this includse picking a METRIC or picking an aggregation which doesn't require a field
            this.commitAggregation(agg.value);
        }
    }

    onPickField(fieldId) {
        this.commitAggregation(AggregationClause.setField(this.state.aggregation, fieldId));
    }

    onClearAggregation() {
        this.setState({
            choosingField: false
        });
    }

    getAggregationFieldOptions(aggOperator) {
        // NOTE: we don't use getAggregator() here because availableAggregations has the table.fields populated on the aggregation options
        const aggOptions = this.props.availableAggregations.filter((o) => o.short === aggOperator);
        if (aggOptions && aggOptions.length > 0) {
            return Query.getFieldOptions(this.props.tableMetadata.fields, true, aggOptions[0].validFieldsFilters[0])
        }
    }

    itemIsSelected(item) {
        const { aggregation } = this.props;
        return (aggregation[0] === item.value[0] && (aggregation[0] !== "METRIC" || aggregation[1] === item.value[1]));
    }

    renderItemExtra(item, itemIndex) {
        if (item.aggregation && item.aggregation.description) {
            return (
                <div className="p1">
                    <Tooltip tooltip={item.aggregation.description}>
                        <span className="QuestionTooltipTarget" />
                    </Tooltip>
                </div>
            );
        } else if (item.metric) {
            return this.renderMetricTooltip(item.metric);
        }
    }

    renderMetricTooltip(metric) {
        let { tableMetadata } = this.props;
        return (
            <div className="p1">
                <Tooltip tooltip={<QueryDefinitionTooltip type="metric" object={metric} tableMetadata={tableMetadata} />}>
                    <span className="QuestionTooltipTarget" />
                </Tooltip>
            </div>
        );
    }

    render() {
        const { availableAggregations, tableMetadata } = this.props;
        const { aggregation, choosingField } = this.state;

        let selectedAggregation;
        if (AggregationClause.isMetric(aggregation)) {
            selectedAggregation = _.findWhere(tableMetadata.metrics, { id: AggregationClause.getMetric(aggregation) });
        } else if (AggregationClause.getOperator(aggregation)) {
            selectedAggregation = _.findWhere(availableAggregations, { short: AggregationClause.getOperator(aggregation) });
        }

        let sections = [{
            name: "Metabasics",
            items: availableAggregations.map(aggregation => ({
                name: aggregation.name,
                value: [aggregation.short].concat(aggregation.fields.map(field => null)),
                aggregation: aggregation
            })),
            icon: "table2"
        }];

        // we only want to consider active metrics, with the ONE exception that if the currently selected aggregation is a
        // retired metric then we include it in the list to maintain continuity
        let metrics = tableMetadata.metrics && tableMetadata.metrics.filter((mtrc) => mtrc.is_active === true || (selectedAggregation && selectedAggregation.id === mtrc.id));
        if (metrics && metrics.length > 0) {
            sections.push({
                name: "Common Metrics",
                items: metrics.map(metric => ({
                    name: metric.name,
                    value: ["METRIC", metric.id],
                    metric: metric
                })),
                icon: "star-outline"
            });
        }

        if (sections.length === 1) {
            sections[0].name = null
        }

        if (!choosingField) {
            return (
                <AccordianList
                    className="text-green"
                    sections={sections}
                    onChange={this.onPickAggregation}
                    itemIsSelected={this.itemIsSelected.bind(this)}
                    renderSectionIcon={(s) => <Icon name={s.icon} size={18} />}
                    renderItemExtra={this.renderItemExtra.bind(this)}
                    getItemClasses={(item) => item.metric && !item.metric.is_active ? "text-grey-3" : null }
                />
            );

        } else {
            const [agg, fieldId] = aggregation;
            return (
                <div style={{width: 300}}>
                    <div className="text-grey-3 p1 py2 border-bottom flex align-center">
                        <a className="cursor-pointer flex align-center" onClick={this.onClearAggregation}>
                            <Icon name="chevronleft" size={18}/>
                            <h3 className="inline-block pl1">{selectedAggregation.name}</h3>
                        </a>
                    </div>
                    <FieldList
                        className={"text-green"}
                        tableMetadata={tableMetadata}
                        field={fieldId}
                        fieldOptions={this.getAggregationFieldOptions(agg)}
                        customFieldOptions={this.props.customFields}
                        onFieldChange={this.onPickField}
                        enableTimeGrouping={false}
                    />
                </div>
            );
        }
    }
}
