import React, { Component, PropTypes } from "react";

import styles from "./Funnel.css";

import cx from "classnames";
import { normal } from "metabase/lib/colors";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";

const DEFAULT_COLORS = Object.values(normal);

export default class Funnel extends Component {
    static displayName = "Funnel";
    static identifier = "funnel";
    static iconName = "funnel";

    static minSize = {
        width: 5,
        height: 4
    };

    static propTypes = {
        data: PropTypes.object.isRequired
    };

    static defaultProps = {
        className: ""
    };

    constructor(props, context) {
        super(props, context);

        this.state = {}
    }

    static isSensible(cols, rows) {
        return cols.length === 2;
    }

    static checkRenderable(cols, rows, settings) {
        if (!settings["funnel.metrics"] || !settings["funnel.step"]) {
            throw new ChartSettingsError("Please select columns in the chart settings.", "Data");
        }
    }

    render() {
        const { data, settings } = this.props;
        let { rows, cols } = data;
        let { dataset, total, steps } = extractStepsInfos(cols, rows, settings);

        // Our SVG canvas is 600x300 so we can use absolute value here.
        // Indicate the width of each step, we have some margin on left/right,
        // so we use only 570 as our available area.
        const STEP_SIZE = 570 / steps.length;

        // Shift the funnel "center" line in the middle of the SVN canvas.
        const FUNNEL_SHIFT = 180;

        // Consider the funnel to be height 250 on the initial step, scal all
        // number using this proportion.
        var normalize = (x) => x / total.data[0] * 210;

        // Generate points used from SVG polygon for each step/mosaics.
        function calculatePoints(k, i, serie, total) {
            // Initial step don't draw the polygon.
            if (i == 0) {
                return;
            }

            // Calculate the Y-center for each step at the begin and the end.
            let startCenterY = FUNNEL_SHIFT - normalize(total.data[i - 1]) / 2 + normalize(serie.shifted[i - 1]) + normalize(serie.data[i - 1]) / 2,
                endCenterY = FUNNEL_SHIFT - normalize(total.data[i]) / 2 + normalize(serie.shifted[i]) + normalize(k) / 2,
                startX = i * STEP_SIZE;

            // Calculate all points coordinate.
            let startTopX = startX,
                startTopY = startCenterY - normalize(serie.data[i - 1]) / 2,
                endTopX = startX,
                endTopY = startCenterY + normalize(serie.data[i - 1]) / 2,
                endBottomX = startX + STEP_SIZE,
                endBottomY = endCenterY + normalize(k) / 2,
                startBottomX = startX + STEP_SIZE,
                startBottomY = endCenterY - normalize(k) / 2;

            // Return the string rewuired from SVG polygon tag.
            return [
                `${startTopX},${startTopY}`,
                `${endTopX},${endTopY}`,
                `${endBottomX},${endBottomY}`,
                `${startBottomX},${startBottomY}`
            ].join(' ');
        }

        // Draw lines to separate steps.
        let lines = total.data.map((data, i) => {
            return {
                key: `line-${i}`,
                x1: (i + 1) * STEP_SIZE,
                x2: (i + 1) * STEP_SIZE,
                y1: 0,
                y2: FUNNEL_SHIFT + normalize(data) / 2,
                textAnchor: 'end',
                fill: '#727479',
            }
        });

        // Step label informations.
        let stepsLabel = steps.map((name, i) => {
            return {
                name: name,
                key: `step-${i}`,
                total: total.data[i],
                deltaPercent: Math.round(i === 0 ? 100 : (total.data[i] / total.data[i - 1]) * 100, 2),
                deltaPercentBegin: Math.round(i === 0 ? 100 : (total.data[i] / total.data[0]) * 100, 2),
                x: (i + 1) * STEP_SIZE - 10,
                y: 20,
                fill: '#727479',
                fillOpacity: 1.0 - i * (0.5 / steps.length ),
            }
        });

        // Series label informations.
        let seriesLabel = dataset.map((serie, i) => {
            return {
                key: `serie-${i}`,
                name: serie.name,
                initialValue: serie.data[0],
                x: STEP_SIZE - 10,
                y: FUNNEL_SHIFT - normalize(total.data[0]) / 2 + normalize(serie.shifted[0]) + normalize(serie.data[0]) / 2,
                color: serie.color,
            }
        });

        // Hightlight serie on mouse-over
        var serieMouseOver = (e) => {
            // Get all nodes
            var nodes = [].slice.call(e.currentTarget.parentNode.getElementsByTagName('g'));

            // Remove current node
            nodes.splice(nodes.indexOf(e.currentTarget), 1);

            // Set opacity on other series
            nodes.forEach((el) => el.setAttribute('opacity', 0.5));
        }

        var serieMouseOut = (e) => {
            // Reset opacity on all series
            [].slice.call(e.currentTarget.parentNode.getElementsByTagName('g'))
                .forEach((el) => el.setAttribute('opacity', 1.0));
        }

        return (
            <div className={cx(styles.Funnel, ' full flex flex-column')}>
                <svg width="100%" height="100%" viewBox="0 0 600 300">
                {/* Vertical line separator */}
                    {lines.map((line, i) =>
                        <line {...line} style={{stroke: '#DDD', strokeWidth:1}} ></line>
                    )}

                {/* Funnel steps */}
                    {dataset.map((serie) =>
                        <g
                            key={serie.name}
                            ref={serie.name}
                            onMouseOver={serieMouseOver}
                            onMouseOut={serieMouseOut}
                        >
                            {serie.data.map((point, i) =>
                                <polygon
                                    key={serie.name + '-' + i}
                                    points={calculatePoints(point, i, serie, total)}
                                    fill={serie.color}
                                    fillOpacity={1.0 - i * (0.7 / steps.length )}
                                />
                            )}
                        </g>
                    )}

                {/* Steps title */}
                    {stepsLabel.map((step, i) =>
                        <text key={step.key} x={step.x} y={step.y} fill={step.fill} fillOpacity={step.fillOpacity}>
                            <tspan textAnchor="end" x={step.x} className={styles.StepLabel}>{step.name}</tspan>
                            <tspan className={styles.StepCounter}> ({step.total})</tspan>
                            <tspan textAnchor="end" x={step.x} className={styles.StepPercent}  dy="1.4em">{i !== 0 ? `∆ step ${step.deltaPercent}%` : null}</tspan>
                            <tspan textAnchor="end" x={step.x} className={styles.StepPercent}  dy="1.4em">{i !== 0 ? `∆ total ${step.deltaPercentBegin}%` : null}</tspan>
                        </text>
                    )}

                {/* Series title */}
                    {seriesLabel.map((serie) =>
                        <text key={serie.key} x={serie.x} y={serie.y} fill={serie.color}>
                            <tspan textAnchor="end" x={serie.x} className={styles.SeriesLabel}>{serie.name}</tspan>
                            <tspan textAnchor="end" x={serie.x} className={styles.SeriesCounter} dy="1.4em">{serie.initialValue}</tspan>
                        </text>
                    )}
                </svg>
            </div>
        );
    }
}

function extractStepsInfos(cols, rows, settings) {
    const stepIndex = cols.findIndex((col) => col.name === settings["funnel.step"]);

    const metricIndex = settings["funnel.metrics"].map((metric, i) => {
        return cols.findIndex((col) => col.name === metric);
    });

    var dataset = metricIndex.map((index) => {
        return {
            name: cols[index].name,
            color: DEFAULT_COLORS[index - 1],
            data: rows.map((r) => r[index])
        };
    });

    // Calculate total values
    var total = dataset.reduce((pre, curr) => {
        return {
            data: pre.data.map((i, m) =>  i + curr.data[m])
        }
    });

    var steps = rows.map((r) => r[stepIndex]);

    // Calculate shifted value
    dataset.forEach((s, i) => {
        s.shifted = (i > 0) ?
            dataset[i - 1].shifted.map((v, o) => v + dataset[i - 1].data[o]) :
            s.shifted = s.data.map((v) => 0);
    });
    return {dataset: dataset, total: total, steps: steps};
}
