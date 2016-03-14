import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import styles from "./ChartWithLegend.css";

import LegendVertical from "./LegendVertical.jsx";
import LegendHorizontal from "./LegendHorizontal.jsx";

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

        let chartWidth, chartHeight, flexChart = false;
        let type, LegendComponent;
        let isHorizontal = gridSize && gridSize.width > gridSize.height / GRID_ASPECT_RATIO;
        if (!gridSize || (isHorizontal && gridSize.width > 3 && gridSize.height > 2)) {
            type = "horizontal";
            LegendComponent = LegendVertical;
            if (gridSize && gridSize.width < 6) {
                legendTitles = legendTitles.map(title => Array.isArray(title) ? title.slice(0,1) : title);
            }
            let desiredWidth = height * aspectRatio;
            if (desiredWidth > width * (2 / 3)) {
                flexChart = true;
            } else {
                chartWidth = desiredWidth;
            }
            chartHeight = height;
        } else if (!isHorizontal && gridSize.height > 3 && gridSize.width > 2) {
            type = "vertical";
            LegendComponent = LegendHorizontal;
            legendTitles = legendTitles.map(title => Array.isArray(title) ? title[0] : title);
            let desiredHeight = width * (1 / aspectRatio);
            if (desiredHeight > height * (3 / 4)) {
                // chartHeight = height * (3 / 4);
                flexChart = true;
            } else {
                chartHeight = desiredHeight;
            }
            chartWidth = width;
        } else {
            type = "small";
        }

        return (
            <div className={cx(className, styles.ChartWithLegend, styles[type], flexChart && styles.flexChart)} style={{ paddingBottom: PADDING, paddingLeft: PADDING, paddingRight: PADDING }}>
                { LegendComponent ?
                    <LegendComponent
                        className={styles.Legend}
                        titles={legendTitles}
                        colors={legendColors}
                        hovered={hovered}
                        onHoverChange={onHoverChange}
                    />
                : null }
                <div className={cx(styles.Chart)} style={{ width: chartWidth, height: chartHeight }}>
                    {children}
                </div>
            </div>
        )
    }
}
