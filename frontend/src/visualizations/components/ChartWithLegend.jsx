import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import styles from "./ChartWithLegend.css";

import Legend from "./Legend.jsx";

import cx from "classnames";

const GRID_ASPECT_RATIO = (4 / 3);

export default class ChartWithLegend extends Component {
    render() {
        let { children, legendTitles, legendColors, hovered, onHoverChange, className, gridSize } = this.props;

        let type, legendType;
        let isLandscape = gridSize && gridSize.width > gridSize.height / GRID_ASPECT_RATIO;
        if (!gridSize || (isLandscape && gridSize.width > 3 && gridSize.height > 2)) {
            type = "horizontal";
            legendType = "vertical";
        } else if (!isLandscape && gridSize.height > 3 && gridSize.width > 2) {
            type = "vertical";
            legendType = "horizontal";
        } else {
            type = "small";
            legendType = "none";
        }

        if (legendTitles && !Array.isArray(legendTitles)) {
            legendTitles = legendTitles[legendType] || [];
        }
        console.log("legendTitles", legendTitles, this.props.legendTitles)

        return (
            <div className={cx(className, styles.ChartWithLegend, styles[type])}>
                <Legend
                    className={styles.Legend}
                    type={legendType}
                    titles={legendTitles}
                    colors={legendColors}
                    hovered={hovered}
                    onHoverChange={onHoverChange}
                />
                <div className={styles.Chart}>
                    {children}
                </div>
            </div>
        )
    }
}
