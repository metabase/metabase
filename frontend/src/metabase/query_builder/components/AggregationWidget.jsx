import React, { Component, PropTypes } from "react";

import AggregationPopover from "./AggregationPopover.jsx";
import FieldName from './FieldName.jsx';
import Clearable from './Clearable.jsx';

import Popover from "metabase/components/Popover.jsx";

import Query from "metabase/lib/query";
import { AggregationClause } from "metabase/lib/query";
import { getAggregator } from "metabase/lib/schema_metadata";

import cx from "classnames";
import _ from "underscore";


export default class AggregationWidget extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            isOpen: false
        };

        _.bindAll(this, "open", "close", "setAggregation");
    }

    static propTypes = {
        aggregation: PropTypes.array.isRequired,
        tableMetadata: PropTypes.object.isRequired,
        customFields: PropTypes.object,
        updateAggregation: PropTypes.func.isRequired,
        removeAggregation: PropTypes.func,
    };

    setAggregation(aggregation) {
        this.props.updateAggregation(aggregation);
    }

    open() {
        this.setState({ isOpen: true });
    }

    close() {
        this.setState({ isOpen: false });
    }

    renderStandardAggregation() {
        const { aggregation, tableMetadata } = this.props;
        const fieldId = AggregationClause.getField(aggregation);

        let selectedAggregation = getAggregator(AggregationClause.getOperator(aggregation));
        return (
            <div id="Query-section-aggregation" onClick={this.open} className="Query-section Query-section-aggregation cursor-pointer px1">
                <span className="View-section-aggregation QueryOption py1">
                    {selectedAggregation ? selectedAggregation.name.replace(" of ...", "") : "Choose an aggregation"}
                </span>
                {aggregation.length > 1 &&
                    <div className="View-section-aggregation flex align-center">
                        <span style={{paddingRight: "4px", paddingLeft: "4px"}} className="text-bold">of</span>
                        <FieldName
                            className="View-section-aggregation-target SelectionModule py1"
                            tableMetadata={tableMetadata}
                            field={fieldId}
                            fieldOptions={Query.getFieldOptions(tableMetadata.fields, true)}
                            customFieldOptions={this.props.customFields}
                        />
                    </div>
                }
            </div>
        );
    }

    renderMetricAggregation() {
        const { aggregation, tableMetadata } = this.props;
        const metricId = AggregationClause.getMetric(aggregation);

        let selectedMetric = _.findWhere(tableMetadata.metrics, { id: metricId });
        return (
            <div id="Query-section-aggregation" onClick={this.open} className="Query-section Query-section-aggregation cursor-pointer">
                <span className="View-section-aggregation QueryOption p1">{selectedMetric ? selectedMetric.name.replace(" of ...", "") : "Choose an aggregation"}</span>
            </div>
        );
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
        const { aggregation, addButton } = this.props;
        if (aggregation && aggregation.length > 0) {
            return (
                <div className={cx("Query-section Query-section-aggregation", { "selected": this.state.isOpen })}>
                    <div>
                        <Clearable onClear={this.props.removeAggregation}>
                        {AggregationClause.isMetric(aggregation) ?
                            this.renderMetricAggregation()
                        :
                            this.renderStandardAggregation()
                        }
                        </Clearable>
                        {this.renderPopover()}
                    </div>
                </div>
            );
        } else if (addButton) {
            return (
                <div className={cx("Query-section Query-section-aggregation")} onClick={this.open}>
                    {addButton}
                    {this.renderPopover()}
                </div>
            );
        } else {
            return null;
        }
    }
}
