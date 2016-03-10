import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";
import styles from "./PieChart.css";

import ChartTooltip from "./components/ChartTooltip.jsx";
import ChartWithLegend from "./components/ChartWithLegend.jsx";

import { MinColumnsError } from "metabase/visualizations/lib/errors";
import { getFriendlyName } from "metabase/visualizations/lib/utils";

import { formatValue } from "metabase/lib/formatting";

import * as colors from "metabase/lib/colors";

import d3 from "d3";
import _ from "underscore";

const OUTER_RADIUS = 50; // within 100px canvas
const INNER_RADIUS_RATIO = 3 / 5;

const PAD_ANGLE = (Math.PI / 180) * 1; // 1 degree in radians
const SLICE_THRESHOLD = 2 / 360; // 2 degree in percentage

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
        const { series, hovered, onHoverChange, className, gridSize } = this.props;
        const { data } = series[0];

        const formatDimension = (dimension, jsx = true) => formatValue(dimension, data.cols[0], { jsx, majorWidth: 0 })
        const formatMetric    =    (metric, jsx = true) => formatValue(metric, data.cols[1], { jsx, majorWidth: 0 })
        const formatPercent   =               (percent) => (100 * percent).toFixed(2) + "%"

        let total = data.rows.reduce((sum, row) => sum + row[1], 0);

        let value, title;
        if (hovered && hovered.index != null) {
            const row = series[0].data.rows[hovered.index];
            title = formatDimension(row[0]);
            value = formatMetric(row[1]);
        } else {
            title = "Total";
            value = formatMetric(total);
        }

        let sliceColors = Object.values(colors.normal);

        let [slices, others] = _.chain(data.rows)
            .map(([key, value], index) => ({
                key,
                value,
                percentage: value / total,
                color: sliceColors[index % sliceColors.length]
            }))
            .partition((d) => d.percentage > SLICE_THRESHOLD)
            .value();

        let otherTotal = others.reduce((acc, o) => acc + o.value, 0);
        let otherSlice;
        if (otherTotal > 0) {
            otherSlice = {
                key: "Other",
                value: otherTotal,
                percentage: otherTotal / total,
                color: "gray"
            };
            slices.push(otherSlice);
        }

        let legendTitles = slices.map(slice => [
            slice.key === "Other" ? slice.key : formatDimension(slice.key, false),
            formatPercent(slice.percentage)
        ]);
        let legendColors = slices.map(slice => slice.color);

        const pie = d3.layout.pie()
            .sort(null)
            .padAngle(PAD_ANGLE)
            .value(d => d.value);
        const arc = d3.svg.arc()
            .outerRadius(OUTER_RADIUS)
            .innerRadius(OUTER_RADIUS * INNER_RADIUS_RATIO);

        let hoverForIndex = (index, event) => ({
            index,
            event: event && event.nativeEvent,
            data: slices[index] === otherSlice ?
                others.map(o => ({
                    key: formatDimension(o.key, false),
                    value: formatMetric(o.value, false)
                }))
            : [
                { key: getFriendlyName(data.cols[0]), value: formatDimension(slices[index].key) },
                { key: getFriendlyName(data.cols[1]), value: formatMetric(slices[index].value) },
                { key: "Percentage", value: formatPercent(slices[index].percentage) }
            ]
        });

        return (
            <ChartWithLegend
                className={className}
                legendTitles={legendTitles} legendColors={legendColors}
                gridSize={gridSize}
                hovered={hovered} onHoverChange={(d) => onHoverChange && onHoverChange(d && { ...d, ...hoverForIndex(d.index) })}
            >
                <div className={styles.ChartAndDetail}>
                    <div className={styles.Detail}>
                        <div className={styles.Value}>{value}</div>
                        <div className={styles.Title}>{title}</div>
                    </div>
                    <div className={styles.Chart}>
                        <svg className={styles.Donut} viewBox="0 0 100 100">
                            <g transform={`translate(50,50)`}>
                                {pie(slices).map((slice, index) =>
                                    <path
                                        key={index}
                                        d={arc(slice)}
                                        fill={slices[index].color}
                                        opacity={(hovered && hovered.index != null && hovered.index !== index) ? 0.3 : 1}
                                        onMouseMove={(e) => onHoverChange && onHoverChange(hoverForIndex(index, e))}
                                        onMouseLeave={() => onHoverChange && onHoverChange(null)}
                                    />
                                )}
                            </g>
                        </svg>
                    </div>
                </div>
                <ChartTooltip series={series} hovered={hovered} />
            </ChartWithLegend>
        );
    }
}
