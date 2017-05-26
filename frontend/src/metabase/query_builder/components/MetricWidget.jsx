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
    question: Question,
    metric: Query,
    metricIndex: number,
    setDatasetQuery: (datasetQuery: DatasetQuery) => void,
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

    // TODO: Will setting an aggregation in MetricWidget be possible anymore?
    // setAggregation = (aggregation) => {
    //     const { query, aggregationIndex, updateQuery } = this.props;
    //     // Should be in a Redux action rather than in a component
    //     query.updateAggregation(aggregationIndex, aggregation).update(updateQuery);
    // };

    removeMetric = () => {
        const { question, metricIndex, setDatasetQuery } = this.props;
        setDatasetQuery(question.removeMetric(metricIndex).datasetQuery());
    }

    open() {
        if (!this.props.editable) return;

        this.setState({ isOpen: true });
    }

    close() {
        this.setState({ isOpen: false });
    }

    render() {
        const { metric, editable, color, clearable } = this.props;
        // TODO: Does this sufficiently check that the query has an aggregation?
        if (metric.isStructured() && !metric.isBareRows()) {
            let aggregationName = metric.aggregationName();

            const metricTitle =
                <div id="Query-section-aggregation" onClick={this.open} className={cx("Query-section Query-section-aggregation", {"cursor-pointer": editable})}>
                    <div
                        className={cx("flex-no-shrink", "inline-block circular")}
                        style={{width: 15, height: 15, backgroundColor: color }}
                    />
                    <span className={cx("QueryOption py1 mx1", {"text-success": editable}, {"text-grey-0": !editable})}>
                        { aggregationName == null ? "Choose an aggregation" : aggregationName }
                    </span>
                </div>;

            return (
                <div className={cx("Query-section Query-section-aggregation mr1", { "selected": this.state.isOpen })}>
                    <div>
                        { clearable ?
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
