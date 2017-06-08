import React, { Component } from "react";
import Clearable from './Clearable.jsx';
import Query from "metabase/lib/query";
import cx from "classnames";

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
    //     const { query, aggregationIndex, setDatasetQuery } = this.props;
    //     // Should be in a Redux action rather than in a component
    //     query.updateAggregation(aggregationIndex, aggregation).update(setDatasetQuery);
    // };

    removeMetric = () => {
        const { question, metricIndex, updateQuestion } = this.props;
        updateQuestion(question.removeMetric(metricIndex));
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
