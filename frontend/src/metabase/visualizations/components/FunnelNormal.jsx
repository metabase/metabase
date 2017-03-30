/* @flow */

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import cx from "classnames";
import styles from "./FunnelNormal.css";

import ChartTooltip from "metabase/visualizations/components/ChartTooltip.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import { formatValue } from "metabase/lib/formatting";
import { getFriendlyName } from "metabase/visualizations/lib/utils";

import { normal } from "metabase/lib/colors";

const DEFAULT_COLORS = Object.values(normal);

import type { VisualizationProps, HoverData, HoverObject } from "metabase/visualizations";

type StepInfo = {
    value: number,
    graph: {
        startBottom: number,
        startTop: number,
        endBottom: number,
        endTop: number
    },
    tooltip?: HoverData
};

export default class Funnel extends Component<*, VisualizationProps, *> {
    render() {
        const { className, series, gridSize, hovered, onHoverChange } = this.props;

        const dimensionIndex = 0;
        const metricIndex = 1;
        const cols = series[0].data.cols;
        // $FlowFixMe: doesn't like intersection type
        const rows = series.map(s => s.data.rows[0]);

        const funnelSmallSize = gridSize && (gridSize.width < 7 || gridSize.height <= 5);

        const formatDimension = (dimension, jsx = true) => formatValue(dimension, { column: cols[dimensionIndex], jsx, majorWidth: 0 })
        const formatMetric    =    (metric, jsx = true) => formatValue(metric, { column: cols[metricIndex], jsx, majorWidth: 0 , comma: true})
        const formatPercent   =               (percent) => `${(100 * percent).toFixed(2)} %`

        // Initial infos (required for step calculation)
        var infos: StepInfo[] = [{
            value: rows[0][metricIndex],
            graph: {
                startBottom: 0.0,
                startTop: 1.0,
                endBottom: 0.0,
                endTop: 1.0,
            }
        }];

        var remaining: number = rows[0][metricIndex];

        rows.map((row, rowIndex) => {
            remaining -= (infos[rowIndex].value - row[metricIndex]);

            infos[rowIndex + 1] = {
                value: row[metricIndex],
                graph: {
                    startBottom: infos[rowIndex].graph.endBottom,
                    startTop: infos[rowIndex].graph.endTop,
                    endTop: 0.5 + ((remaining / infos[0].value) / 2),
                    endBottom: 0.5 - ((remaining / infos[0].value) / 2),
                },
                tooltip: [
                    {
                        key: 'Step',
                        value: formatDimension(row[dimensionIndex]),
                    },
                    {
                        key: getFriendlyName(cols[metricIndex]),
                        value: formatMetric(row[metricIndex]),
                    },
                    {
                        key: 'Retained',
                        value: formatPercent(row[metricIndex] / infos[0].value),
                    },
                ],
            };
        });

        // Remove initial setup
        infos = infos.slice(1);

        let initial = infos[0];

        return (
            <div className={cx(className, styles.Funnel, 'flex', {
                [styles.Small]: funnelSmallSize,
                "p1": funnelSmallSize,
                "p2": !funnelSmallSize
            })}>
                <div className={cx(styles.FunnelStep, styles.Initial, 'flex flex-column')}>
                    <Ellipsified className={styles.Head}>{formatDimension(rows[0][dimensionIndex])}</Ellipsified>
                    <div className={styles.Start}>
                        <div className={styles.Title}>{formatMetric(rows[0][metricIndex])}</div>
                        <div className={styles.Subtitle}>{getFriendlyName(cols[dimensionIndex])}</div>
                    </div>
                    {/* This part of code in used only to share height between .Start and .Graph columns. */}
                    <div className={styles.Infos}>
                        <div className={styles.Title}>&nbsp;</div>
                        <div className={styles.Subtitle}>&nbsp;</div>
                    </div>
                </div>
                {infos.slice(1).map((info, index) =>
                    <div key={index} className={cx(styles.FunnelStep, 'flex flex-column')}>
                        <Ellipsified className={styles.Head}>{formatDimension(rows[index + 1][dimensionIndex])}</Ellipsified>
                        <GraphSection
                            index={index}
                            info={info}
                            infos={infos}
                            hovered={hovered}
                            onHoverChange={onHoverChange}
                        />
                        <div className={styles.Infos}>
                            <div className={styles.Title}>{formatPercent(info.value / initial.value)}</div>
                            <div className={styles.Subtitle}>{formatMetric(rows[index + 1][metricIndex])}</div>
                        </div>
                    </div>
                )}
                {/* Display tooltips following mouse */}
                <ChartTooltip series={series} hovered={hovered} />
            </div>
        );
    }
}
const GraphSection = (
    {
        index,
        info,
        infos,
        hovered,
        onHoverChange
    }: {
        index: number,
        info: StepInfo,
        infos: StepInfo[],
        hovered: ?HoverObject,
        onHoverChange: (hovered: ?HoverObject) => void
    }
) => {
    return (
        <svg
            className={styles.Graph}
            onMouseMove={event => onHoverChange({
                index: index,
                event: event.nativeEvent,
                data: info.tooltip
            })}
            onMouseLeave={() => onHoverChange(null)}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
        >
            <polygon
                opacity={1 - index * (0.9 / (infos.length + 1))}
                fill={DEFAULT_COLORS[0]}
                points={
                    `0 ${info.graph.startBottom}, 0 ${info.graph.startTop}, 1 ${info.graph.endTop}, 1 ${info.graph.endBottom}`
                }
            />
        </svg>
    );
};
