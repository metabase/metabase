import cxs from "cxs";
import React, { Component } from "react";
import { connect } from "react-redux";

import { newMetric, selectMetric, selectAndAdvance } from "../actions";
import { fetchMetrics } from "metabase/redux/metadata";

import Button from "metabase/components/Button";

import Text from "metabase/components/Text";

import ResponsiveList from "metabase/components/ResponsiveList";

import { getMetricsForCurrentFlow } from "../selectors";

const mapStateToProps = state => ({
    metrics: getMetricsForCurrentFlow(state)
});

const mapDispatchToProps = {
    fetchMetrics,
    newMetric,
    selectMetric,
    selectAndAdvance
};

const SURFACE_BORDER_COLOR = "#DCE1E4";
const Surface = ({ children }) => (
    <div
        className={cxs({
            backgroundColor: "#fff",
            border: `1px solid ${SURFACE_BORDER_COLOR}`
        })}
    >
        {children}
    </div>
);

@connect(mapStateToProps, mapDispatchToProps)
class MetricLanding extends Component {
    async componentWillMount() {
        this.props.fetchMetrics();
    }
    render() {
        const {
            metrics,
            newMetric,
            selectMetric,
            selectAndAdvance
        } = this.props;
        return (
            <div>
                <Button className="ml-auto" onClick={() => newMetric()} primary>
                    A fresh metric
                </Button>
                <ResponsiveList
                    items={metrics}
                    onClick={metric =>
                        selectAndAdvance(() => selectMetric(metric))}
                />
            </div>
        );
    }
}

export default MetricLanding;
