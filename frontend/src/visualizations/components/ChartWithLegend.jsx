import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import styles from "./ChartWithLegend.css";

import Legend from "./Legend.jsx";
import ExplicitSize from "metabase/components/ExplicitSize.jsx";

import cx from "classnames";

const GRID_ASPECT_RATIO = (4 / 3);
const PADDING = 14;

@ExplicitSize
export default class ChartWithLegend extends Component {
    static defaultProps = {
        aspectRatio: 1
    };

    render() {
        let { children, legendTitles, legendColors, hovered, onHoverChange, className, gridSize, aspectRatio, height, width } = this.props;

        // padding
        width -= PADDING * 2
        height -= PADDING;

        let chartWidth, chartHeight;
        let type, legendType;
        let isLandscape = gridSize && gridSize.width > gridSize.height / GRID_ASPECT_RATIO;
        if (!gridSize || (isLandscape && gridSize.width > 3 && gridSize.height > 2)) {
            type = "horizontal";
            legendType = "vertical";
            chartWidth = Math.min(height * (aspectRatio), width * (2 / 3));
            chartHeight = height;
        } else if (!isLandscape && gridSize.height > 3 && gridSize.width > 2) {
            type = "vertical";
            legendType = "horizontal";
            chartHeight = Math.min(width * (1 / aspectRatio), height * (3 / 4));
            chartWidth = width;
        } else {
            type = "small";
            legendType = "none";
        }

        if (legendTitles && !Array.isArray(legendTitles)) {
            legendTitles = legendTitles[legendType] || [];
        }

        return (
            <div className={cx(className, styles.ChartWithLegend, styles[type])} style={{ paddingBottom: PADDING, paddingLeft: PADDING, paddingRight: PADDING }}>
                <Legend
                    className={styles.Legend}
                    type={legendType}
                    titles={legendTitles}
                    colors={legendColors}
                    hovered={hovered}
                    onHoverChange={onHoverChange}
                />
                <div className={styles.Chart} style={{ width: chartWidth, height: chartHeight }}>
                    {children}
                </div>
            </div>
        )
    }
}
