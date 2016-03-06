import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import styles from "./PieChart.css";

import ChartTooltip from "./components/ChartTooltip.jsx";
import ChartWithLegend from "./components/ChartWithLegend.jsx";

import { MinColumnsError } from "metabase/visualizations/lib/errors";

import { formatNumber } from "metabase/lib/formatting";

import * as colors from "metabase/lib/colors";

import d3 from "d3";

export default class PieChart extends Component {
    static displayName = "Pie";
    static identifier = "pie";
    static iconName = "pie";

    static minSize = { width: 2, height: 3 };

    static isSensible(cols, rows) {
        return cols.length === 2;
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
    }

    render() {
        let { series, hovered, onHoverChange, className, gridSize } = this.props;

        let rows = series[0].data.rows;
        let total = rows.reduce((sum, row) => sum + row[1], 0);

        let legendTitles = {
            horizontal: rows.map(row => String(row[0])),
            vertical: rows.map(row => String(row[0]) + " - " + (100 * row[1] / total).toFixed(2) + "%")
        };

        let value, title;
        if (hovered && hovered.index != null) {
            const row = series[0].data.rows[hovered.index];
            title = String(row[0]);
            value = formatNumber(row[1]);
        } else {
            title = "Total";
            value = formatNumber(total);
        }

        let sliceColors = Object.values(colors.normal);

        const outerRadius = 50;//Math.min(width, height) / 2;
        const innerRadius = outerRadius * 3 / 5;

        const pie = d3.layout.pie()
            .sort(null)
            .padAngle((Math.PI / 180) * 1)
            .value(d => d[1]);
        const arc = d3.svg.arc()
            .outerRadius(outerRadius)
            .innerRadius(innerRadius);
        const slices = pie(rows);

        return (
            <ChartWithLegend className={className} legendTitles={legendTitles} legendColors={sliceColors} gridSize={gridSize} hovered={hovered} onHoverChange={onHoverChange}>
                <div className={styles.ChartAndDetail}>
                    <div className={styles.Detail}>
                        <div className={styles.Value}>{value}</div>
                        <div className={styles.Title}>{title}</div>
                    </div>
                    <div className={styles.Chart}>
                        <svg className={styles.Donut} viewBox="0 0 100 100">
                            <g transform={`translate(50,50)`}>
                                {slices.map((slice, index) =>
                                    <path
                                        key={index}
                                        d={arc(slice)}
                                        fill={sliceColors[index % sliceColors.length]}
                                        opacity={(hovered && hovered.index != null && hovered.index !== index) ? 0.3 : 1}
                                        onMouseMove={(e) => onHoverChange && onHoverChange({ index, event: e.nativeEvent, data: { key: rows[index][0], value: rows[index][1] } })}
                                        onMouseLeave={() => onHoverChange && onHoverChange(null)}
                                    />
                                )}
                            </g>
                        </svg>
                    </div>
                </div>
                <ChartTooltip series={series} hovered={hovered} pinToMouse={true} />
            </ChartWithLegend>
        );
    }
}
