import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import styles from "./PieChart.css";

import ChartTooltip from "./components/ChartTooltip.jsx";
import Legend from "./components/Legend.jsx";

import { MinColumnsError } from "metabase/visualizations/lib/errors";

import { formatNumber } from "metabase/lib/formatting";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";

import * as colors from "metabase/lib/colors";

import d3 from "d3";
import cx from "classnames";

const GRID_ASPECT_RATIO = (4 / 3);

export default class PieChart extends Component {
    static displayName = "Pie";
    static identifier = "pie";
    static iconName = "pie";

    static isSensible(cols, rows) {
        return cols.length === 2;
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
    }

    render() {
        const { series, hovered, onHoverChange, className, size } = this.props;

        let type, legendType;
        if (size && Math.min(size.width, size.height) < 3) {
            type = "small";
            legendType = "none";
        } else if (!size || size.width > size.height / GRID_ASPECT_RATIO) {
            type = "horizontal";
            legendType = "vertical";
        } else {
            type = "vertical";
            legendType = "horizontal";
        }

        let total = series[0].data.rows.reduce((sum, row) => sum + row[1], 0);

        let titles = [];
        if (legendType === "vertical") {
            titles = series[0].data.rows.map(row => String(row[0]) + " - " + (100 * row[1] / total).toFixed(2) + "%");
        } else if (legendType === "horizontal") {
            titles = series[0].data.rows.map(row => String(row[0]));
        }

        let value, title;
        if (hovered && hovered.seriesIndex != null) {
            const row = series[0].data.rows[hovered.seriesIndex];
            title = String(row[0]);
            value = formatNumber(row[1]);
        } else {
            title = "Total";
            value = formatNumber(total);
        }

        return (
            <div className={cx(className, styles.Pie, styles[type])}>
                <Legend
                    className={styles.Legend}
                    type={legendType}
                    titles={titles}
                    colors={Object.values(colors.normal)}
                    hovered={hovered}
                    onHoverChange={onHoverChange}
                />
                <div className={styles.ChartAndDetail}>
                    <div className={styles.Detail}>
                        <div className={styles.Value}>{value}</div>
                        <div className={styles.Title}>{title}</div>
                    </div>
                    <Donut
                        className={styles.Chart}
                        data={series[0].data.rows}
                        colors={Object.values(colors.normal)}
                        hovered={hovered}
                        onHoverChange={onHoverChange}
                    />
                </div>
                <ChartTooltip series={series} hovered={hovered} pinToMouse={true} />

            </div>
        )
    }
}

const Donut = ExplicitSize(({ data, width, height, colors, className, hovered, onHoverChange }) => {
    const outerRadius = Math.min(width, height) / 2;
    const innerRadius = outerRadius * 3 / 5;

    const pie = d3.layout.pie()
        .sort(null)
        .padAngle((Math.PI / 180) * 1)
        .value(d => d[1]);
    const arc = d3.svg.arc()
        .outerRadius(outerRadius)
        .innerRadius(innerRadius);
    const slices = pie(data);

    return (
        <div className={cx(className, styles.Donut)}>
            <svg width={width} height={height}>
                <g transform={`translate(${width / 2},${height / 2})`}>
                    {slices.map((slice, index) =>
                        <path
                            key={index}
                            d={arc(slice)}
                            fill={colors[index % colors.length]}
                            opacity={(hovered && hovered.seriesIndex != null && hovered.seriesIndex !== index) ? 0.3 : 1}
                            onMouseEnter={() => onHoverChange && onHoverChange(null, null, index)}
                            onMouseLeave={() => onHoverChange && onHoverChange(null, null, null)}
                        />
                    )}
                </g>
            </svg>
        </div>
    );
});
