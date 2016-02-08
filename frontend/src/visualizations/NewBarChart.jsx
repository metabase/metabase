import React, { Component, PropTypes } from "react";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";

import { Bar } from "react-chartjs";

import LegendHeader from "./components/LegendHeader.jsx"

import { MinColumnsError } from "./errors";

import { formatValue } from "metabase/lib/formatting";

const COLORS = ["#4A90E2", "#84BB4C", "#F9CF48", "#ED6E6E", "#885AB1"];

const CHART_OPTIONS = {
  animation: false,
  scaleShowGridLines: false,
  datasetFill: true,
  maintainAspectRatio: false,
  barShowStroke: false,
  barStrokeWidth: 2,
  barValueSpacing: 5,
  legendTemplate : "<ul class=\"<%=name.toLowerCase()%>-legend\"><% for (var i=0; i<segments.length; i++){%><li><span style=\"background-color:<%=segments[i].fillColor%>\"></span><%if(segments[i].label){%><%=segments[i].label%><%}%></li><%}%></ul>"
}

function mergeSeries(series) {
    let result = {
        labels: [],
        datasets: []
    };

    let labelsMap = new Map();
    function generateData(rows, col) {
        let data = [];
        for (let row of rows) {
            if (!labelsMap.has(row[0])) {
                labelsMap.set(row[0], result.labels.length);
                result.labels.push(formatValue(row[0], col));
            }
            data[labelsMap.get(row[0])] = row[1];
        }
        return data;
    }

    for (let [index, s] of series.entries()) {
        result.datasets.push({
            label: s.card.name || "",
            fillColor:  COLORS[index % COLORS.length],
            data: generateData(s.data.rows, s.data.cols[0])
        });
    }

    // fill in missing data
    for (let i = 0; i < result.labels.length; i++) {
        for (let dataset of result.datasets) {
            if (dataset.data[i] === undefined) {
                dataset.data[i] = 0;
            }
        }
    }

    return result;
}

export default class NewBarChart extends Component {
    static displayName = "Bar (chart.js)";
    static identifier = "bar-new";
    static iconName = "bar";

    static noHeader = true;

    static isSensible(cols, rows) {
        return cols.length > 1;
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
    }

    static defaultProps = {
        series: []
    };

    render() {
        let { card, series, onAddSeries } = this.props;
        return (
            <div className="flex flex-full flex-column px4 py2">
                <LegendHeader card={card} series={series} onAddSeries={onAddSeries} />
                <BarChart className="flex-full" {...this.props} />
            </div>
        );
    }
}

@ExplicitSize
class BarChart extends Component {
    render() {
        let { width, height, data, card, series } = this.props;
        let options = {
            ...CHART_OPTIONS,
            showScale: true
        };

        let chartData = mergeSeries([{ data, card }].concat(series));

        return (
             <Bar key={"bar_"+width+"_"+height} data={chartData} options={options} width={width} height={height} redraw />
        );
    }
}
