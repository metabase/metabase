/* @flow */

import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import BarChart from "./BarChart.jsx";

import { formatValue } from "metabase/lib/formatting";
import { getSettings } from "metabase/visualizations/lib/settings";
import { assocIn } from "icepick";

import type { VisualizationProps } from "metabase/visualizations";

export default class Funnel extends Component<*, VisualizationProps, *> {
    static uiName = "Funnel";
    static identifier = "funnel";
    static iconName = "funnel";

    static minSize = { width: 3, height: 3 };
    static noHeader = true;

    static hidden = true;

    static isSensible(cols, rows) {
        return true;
    }

    static checkRenderable(cols, rows) {
        // leaving this blank for now since it should be difficult to get into an invalid state
        // TODO: we should really change checkRenderable to take the entire `series` object
    }

    static transformSeries(series) {
        let [{ card, data: { rows, cols }}] = series;
        if (!card._transformed && series.length === 1 && rows.length > 1) {
            return rows.map(row => ({
                card: {
                    ...card,
                    name: formatValue(row[0], { column: cols[0] }),
                    _transformed: true
                },
                data: {
                    rows: [row],
                    cols: cols
                }
            }));
        } else {
            return series;
        }
    }

    render() {
        return (
            <BarChart
                 {...this.props}
                 isScalarSeries={true}
                 settings={{
                     ...this.props.settings,
                     ...getSettings(assocIn(this.props.series, [0, "card", "display"], "bar")),
                     "bar.scalar_series": true
                 }}
             />
        );
    }
}
