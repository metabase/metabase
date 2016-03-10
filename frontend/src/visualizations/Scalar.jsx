import React, { Component, PropTypes } from "react";
import styles from "./Scalar.css";

import Ellipsified from "metabase/components/Ellipsified.jsx";
import BarChart from "./BarChart.jsx";

import Urls from "metabase/lib/urls";
import { formatScalar } from "metabase/lib/formatting";
import { isSameSeries } from "metabase/visualizations/lib/utils";

import cx from "classnames";

export default class Scalar extends Component {
    static displayName = "Number";
    static identifier = "scalar";
    static iconName = "number";

    static noHeader = true;
    static supportsSeries = true;

    static minSize = { width: 2, height: 2 };

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

        let scalarValue = (data && data.rows && data.rows[0] && data.rows[0][0] != null) ? data.rows[0][0] : "";
        let stringifiedScalar = String(scalarValue);
        let formattedScalarValue = formatScalar(scalarValue, { compact: isSmall });

        return (
            <div className={cx(className, styles.Scalar, styles[isSmall ? "small" : "large"])}>
                <div className="Card-title absolute top right p1 px2">{actionButtons}</div>
                <Ellipsified className={styles.Value} tooltip={stringifiedScalar} alwaysShowTooltip={true}>
                    {formattedScalarValue}
                </Ellipsified>
                <Ellipsified className={styles.Title} tooltip={card.name}>
                    <a className="no-decoration" href={Urls.card(card.id)}>{card.name}</a>
                </Ellipsified>
            </div>
        );
    }
}
