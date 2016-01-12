import React, { Component, PropTypes } from "react";

import FieldWidget from './FieldWidget.jsx';
import AccordianList from "./AccordianList.jsx";
import QueryDefinitionTooltip from "./QueryDefinitionTooltip.jsx";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

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

    setAggregation(item) {
        this.props.updateAggregation(item.value);
        this.refs.aggregation.close();
    }

    setAggregationTarget(target) {
        var queryAggregation = this.props.aggregation;
        queryAggregation[1] = target;

        this.props.updateAggregation(queryAggregation);
    }

    renderSectionIcon(section) {
        return <Icon name={section.icon} width="18" height="18" />
    }

    itemIsSelected(item) {
        const { aggregation } = this.props;
        return (aggregation[0] === item.value[0] && (aggregation[0] !== "METRIC" || aggregation[1] === item.value[1]));
    }

    renderItemExtra(item, itemIndex) {
        if (item.aggregation && item.aggregation.description) {
            return (
                <div className="p1">
                    <Tooltip tooltipElement={item.aggregation.description}>
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
                <Tooltip tooltipElement={<QueryDefinitionTooltip object={metric} tableMetadata={tableMetadata} />}>
                    <span className="QuestionTooltipTarget" />
                </Tooltip>
            </div>
        );
    }

    render() {
        const { aggregation, tableMetadata } = this.props;
        const { availableAggregations } = this.state;

        if (!aggregation || aggregation.length === 0) {
            // we can't do anything without a valid aggregation
            return <span/>;
        }

        let selectedAggregation;
        if (aggregation[0] === "METRIC") {
            selectedAggregation = _.findWhere(tableMetadata.metrics, { id: aggregation[1] });
        } else if (aggregation[0]) {
            selectedAggregation = _.findWhere(availableAggregations, { short: aggregation[0] });
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
        if (tableMetadata.metrics && tableMetadata.metrics.length > 0) {
            sections.push({
                name: "Common Metrics",
                items: tableMetadata.metrics.filter((mtrc) => mtrc.is_active === true || (selectedAggregation && selectedAggregation.id === mtrc.id)).map(metric => ({
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

        return (
            <div className='Query-section'>
                <div className="flex align-center">
                    <PopoverWithTrigger
                        ref="aggregation"
                        triggerClasses="View-section-aggregation p1 selected"
                        triggerElement={<span className="QueryOption">{selectedAggregation ? selectedAggregation.name.replace(" of ...", "") : "Choose an aggregation"}</span>}
                        isInitiallyOpen={!selectedAggregation}
                    >
                        <AccordianList
                            className="text-green"
                            sections={sections}
                            onChange={this.setAggregation}
                            itemIsSelected={this.itemIsSelected.bind(this)}
                            renderSectionIcon={this.renderSectionIcon}
                            renderItemExtra={this.renderItemExtra.bind(this)}
                        />
                    </PopoverWithTrigger>
                </div>
                {aggregation[0] !== "METRIC" && aggregation.length > 1 &&
                    <div className="flex align-center">
                        <span className="text-bold">of</span>
                        <FieldWidget
                            color="green"
                            className="View-section-aggregation-target SelectionModule p1"
                            tableMetadata={this.props.tableMetadata}
                            field={this.props.aggregation[1]}
                            fieldOptions={this.state.aggregationFieldOptions}
                            setField={this.setAggregationTarget}
                            isInitiallyOpen={this.props.aggregation[1] == null}
                        />
                    </div>
                }
            </div>
        );
    }
}
