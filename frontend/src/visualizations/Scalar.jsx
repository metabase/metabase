import React, { Component, PropTypes } from "react";

import { formatScalar } from "metabase/lib/formatting";
import { isSameSeries } from "metabase/visualizations/lib/utils";

import BarChart from "./BarChart.jsx";

import LegendHeader from "./components/LegendHeader.jsx";

import cx from "classnames";

export default class Scalar extends Component {
    static displayName = "Number";
    static identifier = "scalar";
    static iconName = "number";

    static noHeader = true;
    static supportsSeries = true;

    static isSensible(cols, rows) {
        return rows.length === 1 && cols.length === 1;
    }

    static checkRenderable(cols, rows) {
        // scalar can always be rendered, nothing needed here
    }

    static seriesAreCompatible(initialSeries, newSeries) {
        if (newSeries.data.cols && newSeries.data.cols.length === 1) {
            return true;
        }
        return false;
    }

    constructor(props, context) {
        super(props, context);
        this.state = {
            series: null,
            isMultiseries: null
        };
    }

    componentWillMount() {
        this.transformSeries(this.props);
    }

    componentWillReceiveProps(newProps) {
        if (isSameSeries(newProps.series, this.props.series)) {
            return;
        }
        this.transformSeries(newProps);
    }

    transformSeries(newProps) {
        let series = newProps.series;
        let isMultiseries = false;
        if (newProps.isMultiseries || newProps.series.length > 1) {
            series = newProps.series.map(s => ({
                card: { ...s.card, display: "bar" },
                data: {
                    cols: [
                        { base_type: "TextField", display_name: "Name" },
                        { ...s.data.cols[0], display_name: "Value" }],
                    rows: [
                        [s.card.name, s.data.rows[0][0]]
                    ]
                }
            }));
            isMultiseries = true;
        }
        this.setState({
            series,
            isMultiseries
        });
    }

    render() {
        let { data, isDashboard, className, onAddSeries, extraActions, hovered } = this.props;

        if (this.state.isMultiseries) {
            return (
                <BarChart
                    className={className}
                    isDashboard={isDashboard}
                    onAddSeries={onAddSeries}
                    extraActions={extraActions}
                    series={this.state.series}
                    isScalarSeries={true}
                    hovered={this.props.hovered}
                    onHoverChange={this.props.onHoverChange}
                    allowSplitAxis={false}
                />
            );
        }

        let formattedScalarValue = (data && data.rows && data.rows[0] && data.rows[0].length > 0) ? formatScalar(data.rows[0][0]) : "";
        if (isDashboard) {
            return (
                <div className={cx("flex flex-column p1", this.props.className)}>
                    { isDashboard &&
                        <LegendHeader
                            series={this.props.series}
                            onAddSeries={onAddSeries}
                            extraActions={extraActions}
                            hovered={hovered}
                            onHoverChange={this.props.onHoverChange}
                        />
                    }
                    <div className={"Card--scalar " + className}>
                        <h1 className="Card-scalarValue text-normal">{formattedScalarValue}</h1>
                    </div>
                </div>
            );
        } else {
            return (
                <div className={"Visualization--scalar flex layout-centered " + className}>
                    <span>{formattedScalarValue}</span>
                </div>
            );
        }
    }
}
