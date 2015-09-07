'use strict';

import _ from "underscore";

import React, { Component, PropTypes } from 'react';
import rd3 from 'react-d3';

let AreaChart = rd3.AreaChart;
let BarChart = rd3.BarChart;
let PieChart = rd3.PieChart;
let LineChart = rd3.LineChart;

export class CardRenderer extends Component {
    parseData() {
        const { data } = this.props
        return _.map(data.rows, function (d) {
            return {
                x: new Date(d[0]),
                y: d[1]
            }
        })
    }
    chartType() {
        const { type, data, width, height } = this.props
        switch(type) {
            case 'line':
                return (
                    <LineChart
                        width={width}
                        height={height}
                        data={[{ values: this.parseData(data.rows)}]}
                        legend={false}
                    />
                )
                break;
            case 'area':
                return (
                    <AreaChart
                        width={width}
                        height={height}
                        data={[{ values: this.parseData(data.rows)}]}
                        legend={false}
                    />
                )
                break;
            case 'pie':
                return (
                    <PieChart
                        width={width}
                        height={height}
                        data={[{ values: this.parseData(data.rows)}]}
                        legend={true}
                    />
                )
                break;
            case 'bar':
                return (
                    <BarChart
                        width={width}
                        height={height}
                        data={[{ values: this.parseData(data.rows)}]}
                        legend={true}
                    />
                )
            default:
                return (
                    <BarChart
                        width={width}
                        height={height}
                        data={[{ values: this.parseData(data.rows)}]}
                        legend={true}
                    />
                )
        }
    }
    render() {
        return this.chartType()
    }
}
