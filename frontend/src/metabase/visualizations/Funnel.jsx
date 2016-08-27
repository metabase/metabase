import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import cx from "classnames";
import styles from "./Funnel.css";

import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { formatValue } from "metabase/lib/formatting";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import TooltipTable from "metabase/components/TooltipTable.jsx"

import { normal } from "metabase/lib/colors";

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

    constructor(props, context) {
        super(props, context);

        this.state = {}
    }

    static isSensible(cols, rows) {
        return cols.length === 2;
    }

    static checkRenderable(cols, rows, settings) {
        if (!settings["funnel.dimension"] || !settings["funnel.misure"]) {
            throw new ChartSettingsError("Please select columns in the chart settings.", "Data");
        }
    }

    render() {
        const { data, settings, gridSize } = this.props;
        let { rows, cols } = data;

        const dimensionIndex = cols.findIndex((col) => col.name === settings["funnel.dimension"]);
        const metricIndex = cols.findIndex((col) => col.name === settings["funnel.misure"]);
        const funnelSmallSize = gridSize.width < 7 || gridSize.height <= 5;

        const formatDimension = (dimension, jsx = true) => formatValue(dimension, { column: cols[dimensionIndex], jsx, majorWidth: 0 })
        const formatMetric    =    (metric, jsx = true) => formatValue(metric, { column: cols[metricIndex], jsx, majorWidth: 0 , comma: true})
        const formatPercent   =               (percent) => `${(100 * percent).toFixed(2)} %`
        const calculateGraphStyle = (info, currentStep, stepsNumber) => {
            var sizeConverter = 100;

            return {
                WebkitClipPath: `polygon(0 ${info.graph.startBottom * sizeConverter}%, 0 ${info.graph.startTop * sizeConverter}%, 100% ${info.graph.endTop * sizeConverter}%, 100% ${info.graph.endBottom * sizeConverter}%)`,
                MozClipPath: `polygon(0 ${info.graph.startBottom * sizeConverter}%, 0 ${info.graph.startTop * sizeConverter}%, 100% ${info.graph.endTop * sizeConverter}%, 100% ${info.graph.endBottom * sizeConverter}%)`,
                msClipPath: `polygon(0 ${info.graph.startBottom * sizeConverter}%, 0 ${info.graph.startTop * sizeConverter}%, 100% ${info.graph.endTop * sizeConverter}%, 100% ${info.graph.endBottom * sizeConverter}%)`,
                ClipPath: `polygon(0 ${info.graph.startBottom * sizeConverter}%, 0 ${info.graph.startTop * sizeConverter}%, 100% ${info.graph.endTop * sizeConverter}%, 100% ${info.graph.endBottom * sizeConverter}%)`,
                backgroundColor: DEFAULT_COLORS[0],
                opacity: 1 - (currentStep * (0.9 / stepsNumber)),
            };
        }

        var infos = calculateStepsInfos(cols, rows, settings, dimensionIndex, metricIndex);
        let initial = infos[0];
        infos.shift();

        var tooltipInfos = infos.map((info, rowIndex) => {
            return [
                {
                    key: 'Step',
                    value: formatDimension(rows[rowIndex][dimensionIndex]),
                },
                {
                    key: getFriendlyName(cols[dimensionIndex]),
                    value: formatMetric(rows[rowIndex][metricIndex]),
                },
                {
                    key: 'Retained',
                    value: formatPercent(info.value / initial.value),
                },
            ];
        })

        return (
            <div className={cx(styles.Funnel, funnelSmallSize ? styles.Small : null, 'flex', funnelSmallSize ? 'p2' : 'p3')}>
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
                {infos.map((info, infoIndex) =>
                    <div key={infoIndex} className={cx(styles.FunnelStep, 'flex flex-column')}>
                        <Ellipsified className={styles.Head}>{formatDimension(rows[infoIndex + 1][dimensionIndex])}</Ellipsified>
                        <Tooltip
                            isEnabled={funnelSmallSize}
                            verticalAttachments={["bottom", "top"]}
                            tooltip={<TooltipTable data={tooltipInfos[infoIndex]}/>}>

                            <div className={styles.Graph} style={calculateGraphStyle(info, infoIndex, infos.length + 1)}>&nbsp;</div>
                        </Tooltip>
                        <div className={styles.Infos}>
                            <div className={styles.Title}>{formatPercent(info.value / initial.value)}</div>
                            <div className={styles.Subtitle}>{formatMetric(rows[infoIndex + 1][metricIndex])}</div>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}


function calculateStepsInfos(cols, rows, settings, dimensionIndex, metricIndex) {
    // Initial infos (required for step calculation)
    var infos = [{
        value: rows[0][metricIndex],
        graph: {
            startBottom: 0.0,
            startTop: 1.0,
            endBottom: 0.0,
            endTop: 1.0,
        }
    }];

    var remaning = rows[0][1];

    rows.map((row, rowIndex) => {
        remaning -= (infos[rowIndex].value - row[metricIndex]);

        infos[rowIndex + 1] = {
            value: row[metricIndex],
            graph: {
                startBottom: infos[rowIndex].graph.endBottom,
                startTop: infos[rowIndex].graph.endTop,
                endTop: 0.5 + ((remaning / infos[0].value) / 2),
                endBottom: 0.5 - ((remaning / infos[0].value) / 2),
            }
        }
    });

    // Remove initial setup
    infos.shift();

    return infos;
}

