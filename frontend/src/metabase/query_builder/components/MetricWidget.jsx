import React, { Component } from "react";
import Clearable from './Clearable.jsx';
import cx from "classnames";
import Query from "metabase-lib/lib/queries/Query";
import Question from "metabase-lib/lib/Question";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

type Props = {
    metric: Query,
    editable?: boolean,
    clearable?: boolean,
    // metricIndex and updateQuestion are only needed if clearable = true
    // TODO: Get rid of metricIndex as we can add Question.removeMetric that accepts a metric object or just use MultiQuery API directly
    metricIndex?: number,
    updateQuestion?: (question: Question) => void,
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

    removeMetric = () => {
        const { metricIndex, updateQuestion } = this.props;
        updateQuestion(this.metric.question().removeMetric(metricIndex));
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

        if (metric instanceof StructuredQuery && !metric.isBareRows()) {
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
