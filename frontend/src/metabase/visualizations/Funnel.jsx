import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import styles from "./Funnel.css";

import cx from "classnames";
import { normal } from "metabase/lib/colors";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";

const DEFAULT_COLORS = Object.values(normal);

import _ from "underscore";

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

        const STEP_SIZE = 570 / steps.length;
        const FUNNEL_SHIFT = 150;

        var normalize = (x) => x / total.data[0] * 250;

        function calculatePoints(k, i, serie, total) {
            if (i == 0) {
                return;
            }

            let startCenterY = FUNNEL_SHIFT - normalize(total.data[i - 1]) / 2 + normalize(serie.shifted[i - 1]) + normalize(serie.data[i - 1]) / 2,
                endCenterY = FUNNEL_SHIFT - normalize(total.data[i]) / 2 + normalize(serie.shifted[i]) + normalize(k) / 2,
                startX = i * STEP_SIZE;

            let startTopX = startX,
                startTopY = startCenterY - normalize(serie.data[i - 1]) / 2,
                endTopX = startX,
                endTopY = startCenterY + normalize(serie.data[i - 1]) / 2,
                endBottomX = startX + STEP_SIZE,
                endBottomY = endCenterY + normalize(k) / 2,
                startBottomX = startX + STEP_SIZE,
                startBottomY = endCenterY - normalize(k) / 2;

            return [
                `${startTopX},${startTopY}`,
                `${endTopX},${endTopY}`,
                `${endBottomX},${endBottomY}`,
                `${startBottomX},${startBottomY}`
            ].join(' ');
        }


        let lines = total.data.map((data, i) => {
            return {
                key: `line-${i}`,
                x1: (i + 1) * STEP_SIZE,
                x2: (i + 1) * STEP_SIZE,
                y1: 0,
                y2: 300,
                textAnchor: 'end',
                fill: '#727479',
            }
        });

        let stepsLabel = steps.map((name, i) => {
            return {
                name: name,
                key: `step-${i}`,
                x: (i + 1) * STEP_SIZE - 10,
                y: 20,
                textAnchor: 'end',
                fill: '#727479',
            }
        });

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

        return (
            <div className={cx(styles.Funnel, ' full flex flex-column')}>
                <svg width="100%" height="100%" viewBox="0 0 600 300">
                {/* Funnel steps */}
                    {dataset.map((serie) =>
                        <g key={serie.name} ref={serie.name}>
                            {serie.data.map((point, i) =>
                                <polygon key={serie.name + '-' + i} points={calculatePoints(point, i, serie, total)} fill={serie.color} fillOpacity={1.0 - i * (0.7 / steps.length )}></polygon>
                            )}
                        </g>
                    )}

                {/* Vertical line separator */}
                    {lines.map((line, i) =>
                        <line {...line} style={{stroke: '#DDD', strokeWidth:1}} ></line>
                    )}

                {/* Steps title */}
                    {stepsLabel.map((step, i) =>
                        <text {...step} className={styles.StepLabel}>{step.name}</text>
                    )}

                {/* Series title */}
                    {seriesLabel.map((serie) =>
                        <text x={serie.x} y={serie.y} fill={serie.color}>
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
    const stepIndex = _.findIndex(cols, (col) => col.name === settings["funnel.step"]);

    const metricIndex = settings["funnel.metrics"].map((metric, i) => {
        return _.findIndex(cols, (col) => col.name === metric);
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
