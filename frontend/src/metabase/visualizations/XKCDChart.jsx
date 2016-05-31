import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import styles from "./XKCDChart.css";

import { MinColumnsError, MinRowsError } from "metabase/visualizations/lib/errors";

import {
    getFriendlyName,
    getAvailableCanvasWidth,
    getAvailableCanvasHeight
} from "metabase/visualizations/lib/utils";

import { dimensionIsTimeseries } from "./lib/timeseries";

import xkcdplot from "xkcdplot";
import "xkcdplot/humor-sans";

import cx from "classnames";

export default class XKCDChart extends Component {
    static displayName = "XKCD"
    static identifier = "xkcd";
    static iconName = "pinmap";

    static noHeader = true;

    static isSensible(cols, rows) {
        return rows.length > 1 && cols.length > 1;
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
        if (rows.length < 1) { throw new MinRowsError(1, rows.length); }
    }

    componentDidMount() {
        this.componentDidUpdate();
    }

    componentDidUpdate() {
        let { series } = this.props;

        let parent = ReactDOM.findDOMNode(this);
        while (parent.firstChild) {
            parent.removeChild(parent.firstChild);
        }

        let margin = 50;

        // Build the plot.
        var plot = xkcdplot()
            .width(Math.min(800, getAvailableCanvasWidth(parent) - margin * 2))
            .height(Math.min(600, getAvailableCanvasHeight(parent) - margin * 2))
            .margin(margin)
            .xlabel(getFriendlyName(series[0].data.cols[0]))
            .ylabel(getFriendlyName(series[0].data.cols[1]));

        if (series[0].card.name) {
            plot.title(series[0].card.name);
        }

        plot(parent);

        let colors = [undefined, "red", "grey", "green", "yellow"];
        let isTimeseries = dimensionIsTimeseries(series[0].data);
        series.map((s, index) => {
            let data = s.data.rows.map(row => ({
                x: isTimeseries ? new Date(row[0]).getTime() : row[0],
                y: row[1]
            }));
            plot.plot(data, { stroke: colors[index % colors.length] });
        })

        plot.draw();

        if (series[0].card.id) {
            let title = parent.querySelector(".title");
            title.style = "cursor: pointer;";
            title.addEventListener("click", () => window.location = "/card/" + series[0].card.id);
        }
    }

    render() {
        return (
            <div className={cx(this.props.className, styles.XKCDChart)} />
        );
    }
}
