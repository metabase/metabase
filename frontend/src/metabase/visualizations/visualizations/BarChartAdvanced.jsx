/* @flow */


import React, { Component } from "react";
import PropTypes from "prop-types";
import moment from "moment";

import { isNumeric, isDate } from "metabase/lib/schema_metadata";
import {
    getChartTypeFromData,
    getFriendlyName
} from "metabase/visualizations/lib/utils";
import { addCSSRule } from "metabase/lib/dom";
import { formatValue } from "metabase/lib/formatting";

import { getSettings } from "metabase/visualizations/lib/settings";

import { MinRowsError, ChartSettingsError } from "metabase/visualizations/lib/errors";

import _ from "underscore";

const MAX_SERIES = 20;

const MUTE_STYLE = "opacity: 0.25;"
for (let i = 0; i < MAX_SERIES; i++) {
    addCSSRule(`.LineAreaBarChart.mute-${i} svg.stacked .stack._${i} .area`,       MUTE_STYLE);
    addCSSRule(`.LineAreaBarChart.mute-${i} svg.stacked .stack._${i} .line`,       MUTE_STYLE);
    addCSSRule(`.LineAreaBarChart.mute-${i} svg.stacked .stack._${i} .bar`,        MUTE_STYLE);
    addCSSRule(`.LineAreaBarChart.mute-${i} svg.stacked .dc-tooltip._${i} .dot`,   MUTE_STYLE);

    addCSSRule(`.LineAreaBarChart.mute-${i} svg:not(.stacked) .sub._${i} .bar`,    MUTE_STYLE);
    addCSSRule(`.LineAreaBarChart.mute-${i} svg:not(.stacked) .sub._${i} .line`,   MUTE_STYLE);
    addCSSRule(`.LineAreaBarChart.mute-${i} svg:not(.stacked) .sub._${i} .dot`,    MUTE_STYLE);
    addCSSRule(`.LineAreaBarChart.mute-${i} svg:not(.stacked) .sub._${i} .bubble`, MUTE_STYLE);

    // row charts don't support multiseries
    addCSSRule(`.LineAreaBarChart.mute-${i} svg:not(.stacked) .row`, MUTE_STYLE);
}

import type { VisualizationProps } from "metabase/meta/types/Visualization";

import {
    GRAPH_DATA_SETTINGS,
    STACKABLE_SETTINGS,
    GRAPH_GOAL_SETTINGS,
    GRAPH_COLORS_SETTINGS,
    GRAPH_AXIS_SETTINGS
} from "../lib/settings/graph";

import c3 from "c3";

export default class BarChartAdvanced extends Component {
    static uiName = "Advanced Bar";
    static identifier = "advanced_bar";
    static iconName = "bar";
    static noun = "bar chart";

    static settings = {
        ...GRAPH_DATA_SETTINGS,
        ...STACKABLE_SETTINGS,
        ...GRAPH_GOAL_SETTINGS,
        ...GRAPH_COLORS_SETTINGS,
        ...GRAPH_AXIS_SETTINGS
    };

    props: VisualizationProps;

    static identifier: string;
    static renderer: (element: Element, props: VisualizationProps) => any;

    static noHeader = true;
    static supportsSeries = true;

    static minSize = { width: 4, height: 3 };

    static isSensible(cols, rows) {
        return getChartTypeFromData(cols, rows, false) != null;
    }

    static checkRenderable(series, settings) {
        const singleSeriesHasNoRows = ({ data: { cols, rows} }) => rows.length < 1;
        if (_.every(series, singleSeriesHasNoRows)) {
             throw new MinRowsError(1, 0);
        }

        const dimensions = (settings["graph.dimensions"] || []).filter(name => name);
        const metrics = (settings["graph.metrics"] || []).filter(name => name);
        if (dimensions.length < 1 || metrics.length < 1) {
            throw new ChartSettingsError("Which fields do you want to use for the X and Y axes?", "Data", "Choose fields");
        }
    }

    static seriesAreCompatible(initialSeries, newSeries) {
        let initialSettings = getSettings([initialSeries]);
        let newSettings = getSettings([newSeries]);

        let initialDimensions = getColumnsFromNames(initialSeries.data.cols, initialSettings["graph.dimensions"]);
        let newDimensions = getColumnsFromNames(newSeries.data.cols, newSettings["graph.dimensions"]);
        let newMetrics = getColumnsFromNames(newSeries.data.cols, newSettings["graph.metrics"]);

        // must have at least one dimension and one metric
        if (newDimensions.length === 0 || newMetrics.length === 0) {
            return false;
        }

        // all metrics must be numeric
        if (!_.all(newMetrics, isNumeric)) {
            return false;
        }

        // both or neither primary dimension must be dates
        if (isDate(initialDimensions[0]) !== isDate(newDimensions[0])) {
            return false;
        }

        // both or neither primary dimension must be numeric
        if (isNumeric(initialDimensions[0]) !== isNumeric(newDimensions[0])) {
            return false;
        }

        return true;
    }

    static transformSeries(series) {
        let newSeries = [].concat(...series.map((s, seriesIndex) => transformSingleSeries(s, series, seriesIndex)));
        if (_.isEqual(series, newSeries) || newSeries.length === 0) {
            return series;
        } else {
            return newSeries;
        }
    }

    static propTypes = {
        series: PropTypes.array.isRequired,
        actionButtons: PropTypes.node,
        showTitle: PropTypes.bool,
        isDashboard: PropTypes.bool
    };

    static defaultProps = {
    };

    getType(s) {
        if(typeof s !== 'string') {
          return 'number';
        }
        var formats = [
          moment.ISO_8601,
        ];
        if(moment(s, formats, true).isValid()) {
          //return 'timeseries';
          return 'categories';
        } else {
          return 'categories';
        }
    }

    generateChart() {
        const { series } = this.props;

        c3.generate({
            bindto: '.advanced_bar',
            data: {
                x: 'x',
                columns: [
                      ['x', ...series[0].data.rows.map(function(x) {return x[0]})],
                      ...series.map(function(item, i, arr) {
                            return [item.card.visualization_settings["graph.metrics"][i], ...item.data.rows.map(function(x) {return x[1]})]
                         })
                ],
                type: 'bar'
            },
            bar: {
                width: {
                    ratio: 0.5
                }
            },
            zoom: {
                enabled: true
            },
            axis: {
                x: {
                  type: this.getType(series[0].data.rows[0][0]),
                  label: {
                    text: series[0].card.visualization_settings["graph.dimensions"][0],
                    position: 'outer-middle'
                  }
                },
                y: {
                  type: this.getType(series[0].data.rows[0][1])
                }
            }
        });
    }

    componentDidMount() {
        this.generateChart();
    }

    render() {
        this.generateChart();
        return (
            <div className={'advanced_bar'}/>
        );
    }

}

function getColumnsFromNames(cols, names) {
    if (!names) {
        return [];
    }
    return names.map(name => _.findWhere(cols, { name }));
}

function transformSingleSeries(s, series, seriesIndex) {
    const { card, data } = s;

    // HACK: prevents cards from being transformed too many times
    if (card._transformed) {
        return [s];
    }

    const { cols, rows } = data;
    const settings = getSettings([s]);

    const dimensions = settings["graph.dimensions"].filter(d => d != null);
    const metrics = settings["graph.metrics"].filter(d => d != null);
    const dimensionColumnIndexes = dimensions.map(dimensionName =>
        _.findIndex(cols, (col) => col.name === dimensionName)
    );
    const metricColumnIndexes = metrics.map(metricName =>
        _.findIndex(cols, (col) => col.name === metricName)
    );
    const bubbleColumnIndex = settings["scatter.bubble"] && _.findIndex(cols, (col) => col.name === settings["scatter.bubble"]);
    const extraColumnIndexes = bubbleColumnIndex && bubbleColumnIndex >= 0 ? [bubbleColumnIndex] : [];

    if (dimensions.length > 1) {
        const [dimensionColumnIndex, seriesColumnIndex] = dimensionColumnIndexes;
        const rowColumnIndexes = [dimensionColumnIndex].concat(metricColumnIndexes, extraColumnIndexes);

        const breakoutValues = [];
        const breakoutRowsByValue = new Map;

        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            const seriesValue = row[seriesColumnIndex];

            let seriesRows = breakoutRowsByValue.get(seriesValue);
            if (!seriesRows) {
                breakoutRowsByValue.set(seriesValue, seriesRows = []);
                breakoutValues.push(seriesValue);
            }

            let newRow = rowColumnIndexes.map(columnIndex => row[columnIndex]);
            // $FlowFixMe: _origin not typed
            newRow._origin = { seriesIndex, rowIndex, row, cols };
            seriesRows.push(newRow);
        }

        return breakoutValues.map((breakoutValue) => ({
            card: {
                ...card,
                // if multiseries include the card title as well as the breakout value
                name: [
                    // show series title if it's multiseries
                    series.length > 1 && card.name,
                    // always show grouping value
                    formatValue(breakoutValue, cols[seriesColumnIndex])
                ].filter(n => n).join(": "),
                _transformed: true,
                _breakoutValue: breakoutValue,
                _breakoutColumn: cols[seriesColumnIndex],
            },
            data: {
                rows: breakoutRowsByValue.get(breakoutValue),
                cols: rowColumnIndexes.map(i => cols[i]),
                _rawCols: cols
            },
            // for when the legend header for the breakout is clicked
            clicked: {
                dimensions: [{
                    value: breakoutValue,
                    column: cols[seriesColumnIndex]
                }]
            }
        }));
    } else {
        const dimensionColumnIndex = dimensionColumnIndexes[0];
        return metricColumnIndexes.map(metricColumnIndex => {
            const col = cols[metricColumnIndex];
            const rowColumnIndexes = [dimensionColumnIndex].concat(metricColumnIndex, extraColumnIndexes);
            return {
                card: {
                    ...card,
                    name: [
                        // show series title if it's multiseries
                        series.length > 1 && card.name,
                        // show column name if there are multiple metrics
                        metricColumnIndexes.length > 1 && getFriendlyName(col)
                    ].filter(n => n).join(": "),
                    _transformed: true,
                    _seriesIndex: seriesIndex,
                },
                data: {
                    rows: rows.map((row, rowIndex) => {
                        const newRow = rowColumnIndexes.map(i => row[i]);
                        // $FlowFixMe: _origin not typed
                        newRow._origin = { seriesIndex, rowIndex, row, cols };
                        return newRow;
                    }),
                    cols: rowColumnIndexes.map(i => cols[i]),
                    _rawCols: cols
                }
            };
        });
    }
}

