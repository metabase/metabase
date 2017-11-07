/// code to "apply" chart tooltips. (How does one apply a tooltip?)

import _ from "underscore";
import d3 from "d3";

import { formatValue } from "metabase/lib/formatting";
import type { ClickObject } from "metabase/meta/types/Visualization"

import { isNormalized, isStacked } from "./renderer_utils";
import { determineSeriesIndexFromElement } from "./tooltip";
import { getFriendlyName } from "./utils";

function applyChartTooltips(chart, series, isStacked, isNormalized, isScalarSeries, onHoverChange, onVisualizationClick) {
    let [{ data: { cols } }] = series;
    chart.on("renderlet.tooltips", function(chart) {
        chart.selectAll("title").remove();

        if (onHoverChange) {
            chart.selectAll(".bar, .dot, .area, .line, .bubble")
                 .on("mousemove", function(d, i) {
                     const seriesIndex = determineSeriesIndexFromElement(this, isStacked);
                     const card = series[seriesIndex].card;
                     const isSingleSeriesBar = this.classList.contains("bar") && series.length === 1;
                     const isArea = this.classList.contains("area");

                     let data = [];
                     if (Array.isArray(d.key)) { // scatter
                         if (d.key._origin) {
                             data = d.key._origin.row.map((value, index) => {
                                 const col = d.key._origin.cols[index];
                                 return { key: getFriendlyName(col), value: value, col };
                             });
                         } else {
                             data = d.key.map((value, index) => (
                                 { key: getFriendlyName(cols[index]), value: value, col: cols[index] }
                             ));
                         }
                     } else if (d.data) { // line, area, bar
                         if (!isSingleSeriesBar) {
                             cols = series[seriesIndex].data.cols;
                         }

                         data = [
                             {
                                 key: getFriendlyName(cols[0]),
                                 value: d.data.key,
                                 col: cols[0]
                             },
                             {
                                 key: getFriendlyName(cols[1]),
                                 value: isNormalized
                                      ? `${formatValue(d.data.value) * 100}%`
                                      : d.data.value,
                                 col: cols[1]
                             }
                         ];
                     }

                     if (data && series.length > 1) {
                         if (card._breakoutColumn) {
                             data.unshift({
                                 key: getFriendlyName(card._breakoutColumn),
                                 value: card._breakoutValue,
                                 col: card._breakoutColumn
                             });
                         }
                     }

                     data = _.uniq(data, (d) => d.col);

                     onHoverChange({
                         // for single series bar charts, fade the series and highlght the hovered element with CSS
                         index: isSingleSeriesBar ? -1 : seriesIndex,
                         // for area charts, use the mouse location rather than the DOM element
                         element: isArea ? null : this,
                         event: isArea ? d3.event : null,
                         data: data.length > 0 ? data : null,
                     });
                 })
                 .on("mouseleave", function() {
                     if (!onHoverChange) {
                         return;
                     }
                     onHoverChange(null);
                 })
        }

        if (onVisualizationClick) {
            const onClick = function(d) {
                const seriesIndex = determineSeriesIndexFromElement(this, isStacked);
                const card = series[seriesIndex].card;
                const isSingleSeriesBar = this.classList.contains("bar") && series.length === 1;

                let clicked: ?ClickObject;
                if (Array.isArray(d.key)) { // scatter
                    clicked = {
                        value: d.key[2],
                        column: cols[2],
                        dimensions: [
                            { value: d.key[0], column: cols[0] },
                            { value: d.key[1], column: cols[1] }
                        ].filter(({ column }) =>
                            // don't include aggregations since we can't filter on them
                            column.source !== "aggregation"
                        ),
                        origin: d.key._origin
                    }
                } else if (isScalarSeries) {
                    // special case for multi-series scalar series, which should be treated as scalars
                    clicked = {
                        value: d.data.value,
                        column: series[seriesIndex].data.cols[1]
                    };
                } else if (d.data) { // line, area, bar
                    if (!isSingleSeriesBar) {
                        cols = series[seriesIndex].data.cols;
                    }
                    clicked = {
                        value: d.data.value,
                        column: cols[1],
                        dimensions: [
                            { value: d.data.key, column: cols[0] }
                        ]
                    }
                } else {
                    clicked = {
                        dimensions: []
                    };
                }

                // handle multiseries
                if (clicked && series.length > 1) {
                    if (card._breakoutColumn) {
                        // $FlowFixMe
                        clicked.dimensions.push({
                            value: card._breakoutValue,
                            column: card._breakoutColumn
                        });
                    }
                }

                if (card._seriesIndex != null) {
                    // $FlowFixMe
                    clicked.seriesIndex = card._seriesIndex;
                }

                if (clicked) {
                    const isLine = this.classList.contains("dot");
                    onVisualizationClick({
                        ...clicked,
                        element: isLine ? this : null,
                        event: isLine ? null : d3.event,
                    });
                }
            }

            // for some reason interaction with brush requires we use click for .dot and .bubble but mousedown for bar
            chart.selectAll(".dot, .bubble")
                 .style({ "cursor": "pointer" })
                 .on("click", onClick);
            chart.selectAll(".bar")
                 .style({ "cursor": "pointer" })
                 .on("mousedown", onClick);
        }
    });
}


export function setupTooltips({ settings, series, isScalarSeries, onHoverChange, onVisualizationClick }, datas, parent, { isBrushing }) {
    applyChartTooltips(parent, series, isStacked(settings, datas), isNormalized(settings, datas), isScalarSeries, (hovered) => {
        // disable tooltips while brushing
        if (onHoverChange && !isBrushing()) {
            // disable tooltips on lines
            if (hovered && hovered.element && hovered.element.classList.contains("line")) {
                delete hovered.element;
            }
            onHoverChange(hovered);
        }
    }, onVisualizationClick);
}
