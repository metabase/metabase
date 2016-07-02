import React, { Component, PropTypes } from "react";
import styles from "./Scalar.css";

import Ellipsified from "metabase/components/Ellipsified.jsx";
import BarChart from "./BarChart.jsx";

import Urls from "metabase/lib/urls";
import { formatValue } from "metabase/lib/formatting";
import { isSameSeries } from "metabase/visualizations/lib/utils";

import cx from "classnames";
import i from "icepick";

export default class Scalar extends Component {
    static displayName = "Number";
    static identifier = "scalar";
    static iconName = "number";

    static noHeader = true;
    static supportsSeries = true;

    static minSize = { width: 3, height: 3 };

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
        let { card, data, isDashboard, className, onAddSeries, actionButtons, hovered, onHoverChange, gridSize } = this.props;

        if (this.state.isMultiseries) {
            return (
                <BarChart
                    className={className}
                    isDashboard={isDashboard}
                    onAddSeries={onAddSeries}
                    actionButtons={actionButtons}
                    series={this.state.series}
                    isScalarSeries={true}
                    hovered={hovered}
                    onHoverChange={onHoverChange}
                    allowSplitAxis={false}
                />
            );
        }

        let isSmall = gridSize && gridSize.width < 4;

        let scalarValue = i.getIn(data, ["rows", 0, 0]);
        let compactScalarValue = scalarValue == undefined ? "" :
            formatValue(scalarValue, { column: i.getIn(data, ["cols", 0]), compact: isSmall });
        let fullScalarValue = scalarValue == undefined ? "" :
            formatValue(scalarValue, { column: i.getIn(data, ["cols", 0]), compact: false });

        return (
            <div className={cx(className, styles.Scalar, styles[isSmall ? "small" : "large"])}>
                <div className="Card-title absolute top right p1 px2">{actionButtons}</div>
                <Ellipsified className={cx(styles.Value, 'ScalarValue', 'fullscreen-normal-text', 'fullscreen-night-text')} tooltip={fullScalarValue} alwaysShowTooltip={fullScalarValue !== compactScalarValue}>
                    {compactScalarValue}
                </Ellipsified>
                <Ellipsified className={styles.Title} tooltip={card.name}>
                    <a className="no-decoration fullscreen-normal-text fullscreen-night-text" href={Urls.card(card.id)}>{card.name}</a>
                </Ellipsified>
            </div>
        );
    }
}
