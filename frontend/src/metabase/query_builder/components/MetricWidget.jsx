import React, { Component } from "react";
import PropTypes from "prop-types";

import AggregationPopover from "./AggregationPopover.jsx";
import FieldName from './FieldName.jsx';
import Clearable from './Clearable.jsx';

import Popover from "metabase/components/Popover.jsx";

import Query, { AggregationClause, NamedClause } from "metabase/lib/query";
import { getAggregator } from "metabase/lib/schema_metadata";
import { format } from "metabase/lib/expressions/formatter";

import cx from "classnames";
import _ from "underscore";

export default class MetricWidget extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            isOpen: false
        };

        _.bindAll(this, "open", "close", "setAggregation");
    }

    static propTypes = {
        aggregation: PropTypes.array,
        color: PropTypes.string,
        tableMetadata: PropTypes.object.isRequired,
        customFields: PropTypes.object,
        updateMetric: PropTypes.func.isRequired,
        removeMetric: PropTypes.func,
        editable: PropTypes.bool,
        clearable: PropTypes.bool
    };

    static defaultProps = {
        editable: false,
        clearable: false
    };

    setAggregation(aggregation) {
        this.props.updateMetric(aggregation);
    }

    open() {
        if (!this.props.editable) return;

        this.setState({ isOpen: true });
    }

    close() {
        this.setState({ isOpen: false });
    }

    renderStandardAggregation() {
        const { aggregation, tableMetadata, editable } = this.props;
        const fieldId = AggregationClause.getField(aggregation);

        let selectedAggregation = getAggregator(AggregationClause.getOperator(aggregation));
        // if this table doesn't support the selected aggregation, prompt the user to select a different one
        if (selectedAggregation && _.findWhere(tableMetadata.aggregation_options, { short: selectedAggregation.short })) {
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
        const { aggregation, tableMetadata } = this.props;
        const metricId = AggregationClause.getMetric(aggregation);

        let selectedMetric = _.findWhere(tableMetadata.metrics, { id: metricId });
        if (selectedMetric) {
            return selectedMetric.name.replace(" of ...", "")
        }
    }

    renderCustomAggregation() {
        const { aggregation, tableMetadata, customFields } = this.props;
        return format(aggregation, { tableMetadata, customFields });
    }

    renderPopover() {
        const { aggregation, tableMetadata } = this.props;

        if (this.state.isOpen) {
            return (
                <Popover
                    id="AggregationPopover"
                    ref="aggregationPopover"
                    className="FilterPopover"
                    isInitiallyOpen={true}
                    onClose={this.close}
                    dismissOnEscape={false} // disable for expression editor
                >
                    <AggregationPopover
                        aggregation={aggregation}
                        availableAggregations={tableMetadata.aggregation_options}
                        tableMetadata={tableMetadata}
                        customFields={this.props.customFields}
                        onCommitAggregation={this.setAggregation}
                        onClose={this.close}
                    />
                </Popover>
            );
        }
    }

    render() {
        const { aggregation, name, editable, color, clearable } = this.props;
        if (aggregation && aggregation.length > 0) {
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
                        {clearable ? <Clearable className="pr1" onClear={this.props.removeMetric}>{metricTitle}</Clearable> : metricTitle}
                        {this.renderPopover()}
                    </div>
                </div>
            );
        } else {
            return null;
        }
    }
}
