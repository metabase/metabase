import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import styles from "./Funnel.css";

import * as colors from "metabase/lib/colors";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";

import _ from "underscore";

const STEP_SIZE = 100;
const FUNNEL_SHIFT = 150;

export default class Funnel extends Component {
    static displayName = "Funnel";
    static identifier = "funnel";
    static iconName = "funnel";

    static minSize = {
        width: 4,
        height: 5
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

        return (
            <div className={styles.Funnel}>
                <svg width="100%" height="100%" viewBox="0 0 600 300">
                {/* Funnel steps */}
                    {dataset.map((serie) =>
                        <g key={serie.name} ref={serie.name}>
                            {serie.data.map((point, i) =>
                                <polygon key={serie.name + '-' + i} points={calculatePoints(point, i, serie, total)} fill={serie.color} fillOpacity="0.9"></polygon>
                            )}
                        </g>
                    )}

                {/* Vertical line separator */}
                    {total.data.map((data, i) =>
                        <line key={'line-' + i} x1={i * STEP_SIZE} y1="0" x2={i * STEP_SIZE} y2="300" style={{stroke: '#DDD', strokeWidth:1}} ></line>
                    )}

                {/* Steps title */}
                    {steps.map((name, i) =>
                        <text key={'title-' + i} x={(i + 1) * STEP_SIZE - 10} y="20" textAnchor="end">{name}</text>
                    )}
                {/* Series title */}
                    {dataset.map((serie, i) =>
                        <text key={serie.name + '-title'} x={STEP_SIZE - 10} y={FUNNEL_SHIFT - total.data[0] / 2 + serie.shifted[0] + serie.data[0] / 2} textAnchor="end">{serie.name}</text>
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
            color: colors.harmony[index - 1],
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

function calculatePoints(k, i, serie, total) {
    if (i == 0) {
        return;
    }

    let startCenterY = FUNNEL_SHIFT - total.data[i - 1] / 2 + serie.shifted[i - 1] + serie.data[i - 1] / 2,
        endCenterY = FUNNEL_SHIFT - total.data[i] / 2 + serie.shifted[i] + k / 2,
        startX = (i) * STEP_SIZE;

    let startTopX = startX,
        startTopY = startCenterY - serie.data[i - 1] / 2,
        endTopX = startX,
        endTopY = startCenterY + serie.data[i - 1] / 2,
        endBottomX = startX + STEP_SIZE,
        endBottomY = endCenterY + k / 2,
        startBottomX = startX + STEP_SIZE,
        startBottomY = endCenterY - k / 2;

    return [
        `${startTopX},${startTopY}`,
        `${endTopX},${endTopY}`,
        `${endBottomX},${endBottomY}`,
        `${startBottomX},${startBottomY}`
    ].join(' ');
}
