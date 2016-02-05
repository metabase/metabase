import React, { Component, PropTypes } from "react";

import ExplicitSize from "metabase/components/ExplicitSize.jsx";
import Icon from "metabase/components/Icon.jsx";

import { Bar } from "react-chartjs";

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
    static identifier = "bar";
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

    renderLegendItem(card, index) {
        return (
            <span className="h3 mr2 mb1 text-bold flex align-center">
                <span className="inline-block circular" style={{width: 13, height: 13, backgroundColor: COLORS[index % COLORS.length]}} />
                <span className="ml1">{card.name}</span>
            </span>
        )
    }

    render() {
        let { card, series } = this.props;

        let headers = [];
        headers.push(this.renderLegendItem(card, 0));
        for (let [index, s] of series.entries()) {
            headers.push(this.renderLegendItem(s.card, index + 1));
        }

        if (this.props.onAddSeries) {
            headers.push(
                <a className="h3 mr2 mb1 cursor-pointer flex align-center text-brand-hover" style={{ pointerEvents: "all" }} onClick={this.props.onAddSeries}>
                    <Icon className="circular bordered border-brand text-brand" style={{ padding: "0.25em" }} name="add" width={12} height={12} />
                    <span className="ml1">Add data</span>
                </a>
            );
        }

        return (
            <div className="flex flex-full flex-column px4 py2">
                <div className="Card-title my1 flex flex-no-shrink flex-row flex-wrap">{headers}</div>
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
