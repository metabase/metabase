import React, { Component } from "react";
import PropTypes from "prop-types";

import AggregationPopover from "./AggregationPopover.jsx";
import FieldName from './FieldName.jsx';
import Clearable from './Clearable.jsx';

import Popover from "metabase/components/Popover.jsx";

import QueryWrapper from "metabase-lib/lib/Query";
import Query, { AggregationClause, NamedClause } from "metabase/lib/query";
import { getAggregator } from "metabase/lib/schema_metadata";
import { format } from "metabase/lib/expressions/formatter";

import cx from "classnames";
import _ from "underscore";

import type Aggregation from "metabase-lib/lib/query/Aggregation";

type Props = {
    question: Question
    metric: Query,
    metricIndex: number,
    updateQuery: (datasetQuery: DatasetQuery) => void,
    editable: boolean,
    clearable: boolean,
    color: string,
};

export default class MetricWidget extends Component {
    props: Props;

    constructor(props, context) {
        super(props, context);

        this.state = {
            isOpen: false
        };
    }

    static defaultProps = {
        editable: false,
        clearable: false
    };

    // TODO: Will setting an aggregation in MetricWidget be possible anymore
    // setAggregation = (aggregation) => {
    //     const { query, aggregationIndex, updateQuery } = this.props;
    //     // Should be in a Redux action rather than in a component
    //     query.updateAggregation(aggregationIndex, aggregation).update(updateQuery);
    // };

    removeMetric = () => {
        const { metric, metricIndex, updateQuery } = this.props;
        metric.removeMetric(metricIndex).update(updateQuery);
    }

    open() {
        if (!this.props.editable) return;

        this.setState({ isOpen: true });
    }

    close() {
        this.setState({ isOpen: false });
    }

    renderStandardAggregation() {
        const { metric, editable } = this.props;
        const tableMetadata = metric.tableMetadata();
        const aggregation = metric.aggregation();
        const fieldId = AggregationClause.getField(aggregation);

        let selectedAggregation = getAggregator(AggregationClause.getOperator(aggregation));
        // if this table doesn't support the selected aggregation, prompt the user to select a different one
        if (selectedAggregation && _.findWhere(metric.aggregationOptions(), { short: selectedAggregation.short })) {
            return (
                <span className="flex align-center">
                    { selectedAggregation.name.replace(" of ...", "") }
                    { fieldId &&
                        <span style={{paddingRight: "4px", paddingLeft: "4px"}} className="text-bold">of</span>
                    }
                    { fieldId &&
                        <FieldName
                            className={cx("py1", {"text-success": editable}, {"text-grey-0": !editable})}
                            tableMetadata={tableMetadata}
                            field={fieldId}
                            fieldOptions={Query.getFieldOptions(tableMetadata.fields, true)}
                            customFieldOptions={this.props.customFields}
                        />
                    }
                </span>
            );
        }
    }

    renderMetricAggregation() {
        const { question, metric } = this.props;
        const aggregation = metric.aggregation();
        const metricId = AggregationClause.getMetric(aggregation);

        let selectedMetric = _.findWhere(question.availableMetrics(), { id: metricId });
        if (selectedMetric) {
            return selectedMetric.name.replace(" of ...", "")
        }
    }

    // renderCustomAggregation() {
    //     const { metric, tableMetadata, customFields } = this.props;
    //     return format(aggregation, { tableMetadata, customFields });
    // }

    render() {
        const { aggregation, query, name, editable, color, clearable } = this.props;
        if (aggregation && aggregation.length > 0) {
            const showClearButton = clearable && query.canRemoveAggregation();

            let aggregationName = NamedClause.isNamed(aggregation) ?
                NamedClause.getName(aggregation)
            : AggregationClause.isCustom(aggregation) ?
                this.renderCustomAggregation()
            : AggregationClause.isMetric(aggregation) ?
                this.renderMetricAggregation()
            :
                this.renderStandardAggregation();

            const metricTitle =
                <div id="Query-section-aggregation" onClick={this.open} className={cx("Query-section Query-section-aggregation", {"cursor-pointer": editable})}>
                    <div
                        className={cx("flex-no-shrink", "inline-block circular")}
                        style={{width: 15, height: 15, backgroundColor: color }}
                    />
                    <span className={cx("QueryOption py1 mx1", {"text-success": editable}, {"text-grey-0": !editable})}>
                                    { aggregationName == null ?
                                        "Choose an aggregation"
                                        : name ?
                                            name
                                            :
                                            aggregationName
                                    }
                                </span>
                </div>;

            return (
                <div className={cx("Query-section Query-section-aggregation mr1", { "selected": this.state.isOpen })}>
                    <div>
                        {showClearButton ?
                            <Clearable className="pr1" onClear={this.removeMetric}>{metricTitle}</Clearable>
                            : metricTitle
                        }
                    </div>
                </div>
            );
        } else {
            return null;
        }
    }
}
