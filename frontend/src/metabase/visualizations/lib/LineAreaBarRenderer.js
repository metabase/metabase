/* @flow weak */

import crossfilter from "crossfilter";
import d3 from "d3";
import dc from "dc";
import moment from "moment";
import _ from "underscore";
import { updateIn, getIn } from "icepick";

import {
    computeSplit,
    getFriendlyName,
    getXValues,
    colorShades
} from "./utils";

import { dimensionIsTimeseries, minTimeseriesUnit, computeTimeseriesDataInverval } from "./timeseries";

import { dimensionIsNumeric, computeNumericDataInverval } from "./numeric";

import { applyChartTimeseriesXAxis, applyChartQuantitativeXAxis, applyChartOrdinalXAxis, applyChartYAxis } from "./apply_axis";

import { applyChartTooltips } from "./apply_tooltips";

import {
    HACK_parseTimestamp,
    NULL_DIMENSION_WARNING,
    fillMissingValues,
    forceSortedGroupsOfGroups,
    hasRemappingAndValuesAreStrings,
    initChart,
    makeIndexMap,
    reduceGroup
} from "./renderer_utils";

import { clipPathReference } from "metabase/lib/dom";
import { formatNumber } from "metabase/lib/formatting";
import { isStructured } from "metabase/meta/Card";

import { datasetContainsNoResults } from "metabase/lib/dataset";
import { updateDateTimeFilter, updateNumericFilter } from "metabase/qb/lib/actions";

import { lineAddons } from "./graph/addons"
import { initBrush } from "./graph/brush";

import type { VisualizationProps, SingleSeries } from "metabase/meta/types/Visualization"


// +-------------------------------------------------------------------------------------------------------------------+
// |                                                ON RENDER FUNCTIONS                                                |
// +-------------------------------------------------------------------------------------------------------------------+

// The following functions are applied once the chart is rendered.

function onRenderRemoveClipPath(chart) {
    for (let elem of chart.selectAll(".sub, .chart-body")[0]) {
        // prevents dots from being clipped:
        elem.removeAttribute("clip-path");
    }
}


function onRenderMoveContentToTop(chart) {
    for (let elem of chart.selectAll(".sub, .chart-body")[0]) {
        // move chart content on top of axis (z-index doesn't work on SVG):
        elem.parentNode.appendChild(elem);
    }
}


function onRenderSetDotStyle(chart) {
    for (let elem of chart.svg().selectAll('.dc-tooltip circle.dot')[0]) {
        // set the color of the dots to the fill color so we can use currentColor in CSS rules:
        elem.style.color = elem.getAttribute("fill");
    }
}


const DOT_OVERLAP_COUNT_LIMIT = 8;
const DOT_OVERLAP_RATIO       = 0.10;
const DOT_OVERLAP_DISTANCE    = 8;

function onRenderEnableDots(chart, settings) {
    let enableDots;
    const dots = chart.svg().selectAll(".dc-tooltip .dot")[0];
    if (settings["line.marker_enabled"] != null) {
        enableDots = !!settings["line.marker_enabled"];
    } else if (dots.length > 500) {
        // more than 500 dots is almost certainly too dense, don't waste time computing the voronoi map
        enableDots = false;
    } else {
        const vertices = dots.map((e, index) => {
            let rect = e.getBoundingClientRect();
            return [rect.left, rect.top, index];
        });
        const overlappedIndex = {};
        // essentially pairs of vertices closest to each other
        for (let { source, target } of d3.geom.voronoi().links(vertices)) {
            if (Math.sqrt(Math.pow(source[0] - target[0], 2) + Math.pow(source[1] - target[1], 2)) < DOT_OVERLAP_DISTANCE) {
                // if they overlap, mark both as overlapped
                overlappedIndex[source[2]] = overlappedIndex[target[2]] = true;
            }
        }
        const total = vertices.length;
        const overlapping = Object.keys(overlappedIndex).length;
        enableDots = overlapping < DOT_OVERLAP_COUNT_LIMIT || (overlapping / total) < DOT_OVERLAP_RATIO;
    }
    chart.svg()
         .classed("enable-dots", enableDots)
         .classed("enable-dots-onhover", !enableDots);
}


const VORONOI_TARGET_RADIUS = 25;
const VORONOI_MAX_POINTS    = 300;

/// dispatchUIEvent used below in the "Voroni Hover" stuff
function dispatchUIEvent(element, eventName) {
    let e = document.createEvent("UIEvents");
    // $FlowFixMe
    e.initUIEvent(eventName, true, true, window, 1);
    element.dispatchEvent(e);
}

function onRenderVoronoiHover(chart) {
    const parent = chart.svg().select("svg > g");
    const dots = chart.svg().selectAll(".sub .dc-tooltip .dot")[0];

    if (dots.length === 0 || dots.length > VORONOI_MAX_POINTS) {
        return;
    }

    const originRect = chart.svg().node().getBoundingClientRect();
    const vertices = dots.map(e => {
        let { top, left, width, height } = e.getBoundingClientRect();
        let px = (left + width / 2) - originRect.left;
        let py = (top + height / 2) - originRect.top;
        return [px, py, e];
    });

    // HACK Atte Keinänen 8/8/17: For some reason the parent node is not present in Jest/Enzyme tests
    // so simply return empty width and height for preventing the need to do bigger hacks in test code
    const { width, height } = parent.node() ? parent.node().getBBox() : { width: 0, height: 0 };

    const voronoi = d3.geom.voronoi()
                      .clipExtent([[0,0], [width, height]]);

    // circular clip paths to limit distance from actual point
    parent.append("svg:g")
          .selectAll("clipPath")
          .data(vertices)
          .enter().append("svg:clipPath")
          .attr("id", (d, i) => "clip-" + i)
          .append("svg:circle")
          .attr('cx', (d) => d[0])
          .attr('cy', (d) => d[1])
          .attr('r', VORONOI_TARGET_RADIUS);

    // voronoi layout with clip paths applied
    parent.append("svg:g")
          .classed("voronoi", true)
          .selectAll("path")
          .data(voronoi(vertices), (d) => d&&d.join(","))
          .enter().append("svg:path")
          .filter((d) => d != undefined)
          .attr("d", (d) => "M" + d.join("L") + "Z")
          .attr("clip-path", (d,i) => clipPathReference("clip-" + i))
          .on("mousemove", ({ point }) => {
              let e = point[2];
              dispatchUIEvent(e, "mousemove");
              d3.select(e).classed("hover", true);
          })
          .on("mouseleave", ({ point }) => {
              let e = point[2];
              dispatchUIEvent(e, "mouseleave");
              d3.select(e).classed("hover", false);
          })
          .on("click", ({ point }) => {
              let e = point[2];
              dispatchUIEvent(e, "click");
          })
          .order();
}


function onRenderCleanupGoal(chart, onGoalHover, isSplitAxis) {
    // remove dots
    chart.selectAll(".goal .dot").remove();

    // move to end of the parent node so it's on top
    chart.selectAll(".goal").each(function() { this.parentNode.appendChild(this); });
    chart.selectAll(".goal .line").attr({
        "stroke": "rgba(157,160,164, 0.7)",
        "stroke-dasharray": "5,5"
    });

    // add the label
    let goalLine = chart.selectAll(".goal .line")[0][0];
    if (goalLine) {

        // stretch the goal line all the way across, use x axis as reference
        let xAxisLine = chart.selectAll(".axis.x .domain")[0][0];

        // HACK Atte Keinänen 8/8/17: For some reason getBBox method is not present in Jest/Enzyme tests
        if (xAxisLine && goalLine.getBBox) {
            goalLine.setAttribute("d", `M0,${goalLine.getBBox().y}L${xAxisLine.getBBox().width},${goalLine.getBBox().y}`)
        }

        let { x, y, width } = goalLine.getBBox ? goalLine.getBBox() : { x: 0, y: 0, width: 0 };

        const labelOnRight = !isSplitAxis;
        chart.selectAll(".goal .stack._0")
             .append("text")
             .text("Goal")
             .attr({
                 x: labelOnRight ? x + width : x,
                 y: y - 5,
                 "text-anchor": labelOnRight ? "end" : "start",
                 "font-weight": "bold",
                 fill: "rgb(157,160,164)",
             })
             .on("mouseenter", function() { onGoalHover(this); })
             .on("mouseleave", function() { onGoalHover(null); })
    }
}


function onRenderHideDisabledLabels(chart, settings) {
    if (!settings["graph.x_axis.labels_enabled"]) {
        chart.selectAll(".x-axis-label").remove();
    }
    if (!settings["graph.y_axis.labels_enabled"]) {
        chart.selectAll(".y-axis-label").remove();
    }
}


function onRenderHideDisabledAxis(chart, settings) {
    if (!settings["graph.x_axis.axis_enabled"]) {
        chart.selectAll(".axis.x").remove();
    }
    if (!settings["graph.y_axis.axis_enabled"]) {
        chart.selectAll(".axis.y, .axis.yr").remove();
    }
}


function onRenderHideBadAxis(chart) {
    if (chart.selectAll(".axis.x .tick")[0].length === 1) {
        chart.selectAll(".axis.x").remove();
    }
}


function onRenderDisableClickFiltering(chart) {
    chart.selectAll("rect.bar")
         .on("click", (d) => {
             chart.filter(null);
             chart.filter(d.key);
         });
}


function onRenderFixStackZIndex(chart) {
    // reverse the order of .stack-list and .dc-tooltip-list children so 0 points in stacked
    // charts don't appear on top of non-zero points
    for (const list of chart.selectAll(".stack-list, .dc-tooltip-list")[0]) {
        for (const child of list.childNodes) {
            list.insertBefore(list.firstChild, child);
        }
    }
}


function onRenderSetClassName(chart, isStacked) {
    chart.svg().classed("stacked", isStacked);
}

// the various steps that get called
function onRender(chart, settings, onGoalHover, isSplitAxis, isStacked) {
    onRenderRemoveClipPath(chart);
    onRenderMoveContentToTop(chart);
    onRenderSetDotStyle(chart);
    onRenderEnableDots(chart, settings);
    onRenderVoronoiHover(chart);
    onRenderCleanupGoal(chart, onGoalHover, isSplitAxis); // do this before hiding x-axis
    onRenderHideDisabledLabels(chart, settings);
    onRenderHideDisabledAxis(chart, settings);
    onRenderHideBadAxis(chart);
    onRenderDisableClickFiltering(chart);
    onRenderFixStackZIndex(chart);
    onRenderSetClassName(chart, isStacked);
}


// +-------------------------------------------------------------------------------------------------------------------+
// |                                                   BEFORE RENDER                                                   |
// +-------------------------------------------------------------------------------------------------------------------+

// run these first so the rest of the margin computations take it into account
function beforeRenderHideDisabledAxesAndLabels(chart, settings) {
    onRenderHideDisabledLabels(chart, settings);
    onRenderHideDisabledAxis(chart, settings);
    onRenderHideBadAxis(chart);
}


// min margin
const MARGIN_TOP_MIN        = 20; // needs to be large enough for goal line text
const MARGIN_BOTTOM_MIN     = 10;
const MARGIN_HORIZONTAL_MIN = 20;

// extra padding for axis
const X_AXIS_PADDING = 0;
const Y_AXIS_PADDING = 8;

function adjustMargin(chart, margin, direction, padding, axisSelector, labelSelector) {
    const axis      = chart.select(axisSelector).node();
    const label     = chart.select(labelSelector).node();
    const axisSize  = axis  ? axis.getBoundingClientRect()[direction] + 10 : 0;
    const labelSize = label ? label.getBoundingClientRect()[direction] + 5 : 0;
    chart.margins()[margin] = axisSize + labelSize + padding;
}

function computeMinHorizontalMargins(chart) {
    let min = { left: 0, right: 0 };
    const ticks = chart.selectAll(".axis.x .tick text")[0];
    if (ticks.length > 0) {
        const chartRect = chart.select("svg").node().getBoundingClientRect();
        min.left = chart.margins().left - (ticks[0].getBoundingClientRect().left - chartRect.left);
        min.right = chart.margins().right - (chartRect.right - ticks[ticks.length - 1].getBoundingClientRect().right);
    }
    return min;
}

function beforeRenderFixMargins(chart, settings) {
    // run before adjusting margins
    const mins = computeMinHorizontalMargins()

    // adjust the margins to fit the X and Y axis tick and label sizes, if enabled
    adjustMargin(chart, "bottom", "height", X_AXIS_PADDING, ".axis.x",  ".x-axis-label",          settings["graph.x_axis.labels_enabled"]);
    adjustMargin(chart, "left",   "width",  Y_AXIS_PADDING, ".axis.y",  ".y-axis-label.y-label",  settings["graph.y_axis.labels_enabled"]);
    adjustMargin(chart, "right",  "width",  Y_AXIS_PADDING, ".axis.yr", ".y-axis-label.yr-label", settings["graph.y_axis.labels_enabled"]);

    // set margins to the max of the various mins
    chart.margins().top    = Math.max(MARGIN_TOP_MIN,        chart.margins().top);
    chart.margins().left   = Math.max(MARGIN_HORIZONTAL_MIN, chart.margins().left,  mins.left);
    chart.margins().right  = Math.max(MARGIN_HORIZONTAL_MIN, chart.margins().right, mins.right);
    chart.margins().bottom = Math.max(MARGIN_BOTTOM_MIN,     chart.margins().bottom);
}

// collection of function calls that get made *before* we tell the Chart to render
function beforeRender(chart, settings) {
    beforeRenderHideDisabledAxesAndLabels(chart, settings);
    beforeRenderFixMargins(chart, settings);
}



/// once chart has rendered and we can access the SVG, do customizations to axis labels / etc that you can't do through dc.js
function lineAndBarOnRender(chart, settings, onGoalHover, isSplitAxis, isStacked) {
    beforeRender(chart, settings);
    chart.on("renderlet.on-render", () => onRender(chart, settings, onGoalHover, isSplitAxis, isStacked));
    chart.render();
}

// +-------------------------------------------------------------------------------------------------------------------+
// |                                                     RENDERER                                                      |
// +-------------------------------------------------------------------------------------------------------------------+

const BAR_PADDING_RATIO = 0.2;
const DEFAULT_INTERPOLATION = "linear";

// max number of points to "fill"
// TODO: base on pixel width of chart?
const MAX_FILL_COUNT = 10000;

const UNAGGREGATED_DATA_WARNING = (col) => `"${getFriendlyName(col)}" is an unaggregated field: if it has more than one value at a point on the x-axis, the values will be summed.`


function getDcjsChart(cardType, parent) {
    switch (cardType) {
        case "line":    return lineAddons(dc.lineChart(parent));
        case "area":    return lineAddons(dc.lineChart(parent));
        case "bar":     return dc.barChart(parent);
        case "scatter": return dc.bubbleChart(parent);
        default:        return dc.barChart(parent);
    }
}

function applyChartLineBarSettings(chart, settings, chartType) {
    // LINE/AREA:
    // for chart types that have an 'interpolate' option (line/area charts), enable based on settings
    if (chart.interpolate) chart.interpolate(settings["line.interpolate"] || DEFAULT_INTERPOLATION);

    // AREA:
    if (chart.renderArea) chart.renderArea(chartType === "area");

    // BAR:
    if (chart.barPadding) chart.barPadding(BAR_PADDING_RATIO)
                               .centerBar(settings["graph.x_axis.scale"] !== "ordinal");
}

type LineAreaBarProps = VisualizationProps & {
    chartType: "line" | "area" | "bar" | "scatter",
    isScalarSeries: boolean,
    maxSeries: number
}

export default function lineAreaBar(element: Element, {
    series,
    onHoverChange,
    onVisualizationClick,
    onRender,
    chartType,
    isScalarSeries,
    settings,
    maxSeries,
    onChangeCardAndRun
}: LineAreaBarProps) {
    const colors = settings["graph.colors"];

    // force histogram to be ordinal axis with zero-filled missing points
    const isHistogram = settings["graph.x_axis.scale"] === "histogram";
    if (isHistogram) {
        settings["line.missing"] = "zero";
        settings["graph.x_axis.scale"] = "ordinal"
    }

    // bar histograms have special tick formatting:
    // * aligned with beginning of bar to show bin boundaries
    // * label only shows beginning value of bin
    // * includes an extra tick at the end for the end of the last bin
    const isHistogramBar = isHistogram && chartType === "bar";

    const isTimeseries = settings["graph.x_axis.scale"] === "timeseries";
    const isQuantitative = ["linear", "log", "pow"].indexOf(settings["graph.x_axis.scale"]) >= 0;
    const isOrdinal = !isTimeseries && !isQuantitative;

    // is this a dashboard multiseries?
    // TODO: better way to detect this?
    const isMultiCardSeries = series.length > 1 &&
        getIn(series, [0, "card", "id"]) !== getIn(series, [1, "card", "id"]);


    // find the first nonempty single series
    // $FlowFixMe
    const firstSeries: SingleSeries = _.find(series, (s) => !datasetContainsNoResults(s.data));

    const isDimensionTimeseries = dimensionIsTimeseries(firstSeries.data);
    const isDimensionNumeric = dimensionIsNumeric(firstSeries.data);
    const isRemappedToString = hasRemappingAndValuesAreStrings(firstSeries.data);

    const enableBrush = !!(onChangeCardAndRun && !isMultiCardSeries && isStructured(series[0].card) && !isRemappedToString);

    if (firstSeries.data.cols.length < 2) {
        throw new Error("This chart type requires at least 2 columns.");
    }

    if (series.length > maxSeries) {
        throw new Error(`This chart type doesn't support more than ${maxSeries} series of data.`);
    }

    const warnings = {};
    const warn = (id) => {
        warnings[id] = (warnings[id] || 0) + 1;
    }

    let datas = series.map((s, index) =>
        s.data.rows.map(row => {
            let newRow = [
                // don't parse as timestamp if we're going to display as a quantitative scale, e.x. years and Unix timestamps
                (isDimensionTimeseries && !isQuantitative) ?
                    HACK_parseTimestamp(row[0], s.data.cols[0].unit, warn)
                : isDimensionNumeric ?
                    row[0]
                :
                    String(row[0])
                , ...row.slice(1)
            ]
            // $FlowFixMe: _origin not typed
            newRow._origin = row._origin;
            return newRow;
        })
    );

    // compute the x-values
    let xValues = getXValues(datas, chartType);

    // compute the domain
    let xDomain = d3.extent(xValues);

    let xInterval;
    if (isTimeseries) {
        // compute the interval
        let unit = minTimeseriesUnit(series.map(s => s.data.cols[0].unit));
        xInterval = computeTimeseriesDataInverval(xValues, unit);
    } else if (isQuantitative || isHistogram) {
        if (firstSeries.data.cols[0].binning_info) {
            // Get the bin width from binning_info, if available
            // TODO: multiseries?
            xInterval = firstSeries.data.cols[0].binning_info.bin_width;
        } else {
            // Otherwise try to infer from the X values
            xInterval = computeNumericDataInverval(xValues);
        }
    }

    if (settings["line.missing"] === "zero" || settings["line.missing"] === "none") {
        const fillValue = settings["line.missing"] === "zero" ? 0 : null;
        if (isTimeseries) {
            // $FlowFixMe
            const { interval, count } = xInterval;
            if (count <= MAX_FILL_COUNT) {
                // replace xValues with
                xValues = d3.time[interval]
                    .range(xDomain[0], moment(xDomain[1]).add(1, "ms"), count)
                    .map(d => moment(d));
                datas = fillMissingValues(
                    datas,
                    xValues,
                    fillValue,
                    (m) => d3.round(m.toDate().getTime(), -1) // sometimes rounds up 1ms?
                );
            }
        } if (isQuantitative || isHistogram) {
            // $FlowFixMe
            const count = Math.abs((xDomain[1] - xDomain[0]) / xInterval);
            if (count <= MAX_FILL_COUNT) {
                let [start, end] = xDomain;
                if (isHistogramBar) {
                    // NOTE: intentionally add an end point for bar histograms
                    // $FlowFixMe
                    end += xInterval * 1.5
                } else {
                    // NOTE: avoid including endpoint due to floating point error
                    // $FlowFixMe
                    end += xInterval * 0.5
                }
                xValues = d3.range(start, end, xInterval);
                datas = fillMissingValues(
                    datas,
                    xValues,
                    fillValue,
                    // NOTE: normalize to xInterval to avoid floating point issues
                    (v) => Math.round(v / xInterval)
                );
            }
        } else {
            datas = fillMissingValues(
                datas,
                xValues,
                fillValue
            );
        }
    }

    if (isScalarSeries) {
        xValues = datas.map(data => data[0][0]);
    }

    let dimension, groups, yAxisSplit;

    const isScatter = chartType === "scatter";
    const isStacked = settings["stackable.stack_type"] && datas.length > 1;
    const isNormalized = isStacked && settings["stackable.stack_type"] === "normalized";

    if (isScatter) {
        let dataset = crossfilter();
        datas.map(data => dataset.add(data));

        dimension = dataset.dimension(row => row);
        groups = datas.map(data => {
            let dim = crossfilter(data).dimension(row => row);
            return [
                dim.group().reduceSum((d) => d[2] || 1)
            ]
        });
    } else if (isStacked) {
        let dataset = crossfilter();

        // get the sum of the metric for each dimension value in order to scale
        let scaleFactors = {};
        if (isNormalized) {
            for (let data of datas) {
                for (let [d, m] of data) {
                    scaleFactors[d] = (scaleFactors[d] || 0) + m;
                }
            }

            // $FlowFixMe
            series = series.map(s => updateIn(s, ["data", "cols", 1], (col) => ({
                ...col,
                display_name: "% " + getFriendlyName(col)
            })));
        }

        datas.map((data, i) =>
            dataset.add(data.map(d => ({
                [0]: d[0],
                [i + 1]: isNormalized ? (d[1] / scaleFactors[d[0]]) : d[1]
            })))
        );

        dimension = dataset.dimension(d => d[0]);
        groups = [
            datas.map((data, seriesIndex) =>
                reduceGroup(dimension.group(), seriesIndex + 1, () => warn(UNAGGREGATED_DATA_WARNING(series[seriesIndex].data.cols[0])))
            )
        ];
    } else {
        let dataset = crossfilter();
        datas.map(data => dataset.add(data));

        dimension = dataset.dimension(d => d[0]);
        groups = datas.map((data, seriesIndex) => {
            // If the value is empty, pass a dummy array to crossfilter
            data = data.length > 0 ? data : [[null, null]];

            let dim = crossfilter(data).dimension(d => d[0]);

            return data[0].slice(1).map((_, metricIndex) =>
                reduceGroup(dim.group(), metricIndex + 1, () => warn(UNAGGREGATED_DATA_WARNING(series[seriesIndex].data.cols[0])))
            );
        });
    }

    let yExtents = groups.map(group => d3.extent(group[0].all(), d => d.value));
    let yExtent = d3.extent([].concat(...yExtents));

    // don't auto-split if the metric columns are all identical, i.e. it's a breakout multiseries
    const hasDifferentYAxisColumns = _.uniq(series.map(s => s.data.cols[1])).length > 1;
    if (!isScalarSeries && !isScatter && !isStacked && hasDifferentYAxisColumns && settings["graph.y_axis.auto_split"] !== false) {
        yAxisSplit = computeSplit(yExtents);
    } else {
        yAxisSplit = [series.map((s,i) => i)];
    }

    // Don't apply to linear or timeseries X-axis since the points are always plotted in order
    if (!isTimeseries && !isQuantitative) {
        forceSortedGroupsOfGroups(groups, makeIndexMap(xValues));
    }

    let parent = dc.compositeChart(element);
    initChart(parent, element);

    let isBrushing = false;
    const onBrushChange = () => {
        isBrushing = true;
    }
    const onBrushEnd = (range) => {
        isBrushing = false;
        if (range) {
            const column = series[0].data.cols[0];
            const card = series[0].card;
            const [start, end] = range;
            if (isDimensionTimeseries) {
                onChangeCardAndRun({ nextCard: updateDateTimeFilter(card, column, start, end), previousCard: card });
            } else {
                onChangeCardAndRun({ nextCard: updateNumericFilter(card, column, start, end), previousCard: card });
            }
        }
    }

    let charts = groups.map((group, index) => {
        let chart = getDcjsChart(chartType, parent);

        if (enableBrush) {
            initBrush(parent, chart, onBrushChange, onBrushEnd);
        }

        // disable clicks
        chart.onClick = () => {};

        chart
            .dimension(dimension)
            .group(group[0])
            .transitionDuration(0)
            .useRightYAxis(yAxisSplit.length > 1 && yAxisSplit[1].includes(index));

        if (isScatter) {
            chart
                .keyAccessor((d) => d.key[0])
                .valueAccessor((d) => d.key[1])

            if (chart.radiusValueAccessor) {
                const isBubble = datas[index][0].length > 2;
                if (isBubble) {
                    const BUBBLE_SCALE_FACTOR_MAX = 64;
                    chart
                        .radiusValueAccessor((d) => d.value)
                        .r(d3.scale.sqrt()
                            .domain([0, yExtent[1] * BUBBLE_SCALE_FACTOR_MAX])
                            .range([0, 1])
                        );
                } else {
                    chart.radiusValueAccessor((d) => 1)
                    chart.MIN_RADIUS = 3
                }
                chart.minRadiusWithLabel(Infinity);
            }
        }

        if (chart.defined) {
            chart.defined(
                settings["line.missing"] === "none" ?
                    (d) => d.y != null :
                    (d) => true
            );
        }

        // multiple series
        if (groups.length > 1 || isScatter) {
            // multiple stacks
            if (group.length > 1) {
                // compute shades of the assigned color
                chart.ordinalColors(colorShades(colors[index % colors.length], group.length))
            } else {
                chart.colors(colors[index % colors.length])
            }
        } else {
            chart.ordinalColors(colors)
        }

        for (var i = 1; i < group.length; i++) {
            chart.stack(group[i])
        }

        applyChartLineBarSettings(chart, settings, chartType);

        return chart;
    });

    let onGoalHover = () => {};
    if (settings["graph.show_goal"]) {
        const goalValue = settings["graph.goal_value"];
        const goalData = [[xDomain[0], goalValue], [xDomain[1], goalValue]];
        const goalDimension = crossfilter(goalData).dimension(d => d[0]);
        // Take the last point rather than summing in case xDomain[0] === xDomain[1], e.x. when the chart
        // has just a single row / datapoint
        const goalGroup = goalDimension.group().reduce((p,d) => d[1], (p,d) => p, () => 0);
        const goalIndex = charts.length;
        let goalChart = dc.lineChart(parent)
            .dimension(goalDimension)
            .group(goalGroup)
            .on('renderlet', function (chart) {
                // remove "sub" class so the goal is not used in voronoi computation
                chart.select(".sub._"+goalIndex)
                    .classed("sub", false)
                    .classed("goal", true);
            });
        charts.push(goalChart);

        onGoalHover = (element) => {
            onHoverChange(element && {
                element,
                data: [{ key: "Goal", value: goalValue }]
            });
        }
    }

    parent.compose(charts);

    if (groups.length > 1 && !isScalarSeries) {
        parent.on("renderlet.grouped-bar", function (chart) {
            // HACK: dc.js doesn't support grouped bar charts so we need to manually resize/reposition them
            // https://github.com/dc-js/dc.js/issues/558
            let barCharts = chart.selectAll(".sub rect:first-child")[0].map(node => node.parentNode.parentNode.parentNode);
            if (barCharts.length > 0) {
                let oldBarWidth = parseFloat(barCharts[0].querySelector("rect").getAttribute("width"));
                let newBarWidthTotal = oldBarWidth / barCharts.length;
                let seriesPadding =
                    newBarWidthTotal < 4 ? 0 :
                    newBarWidthTotal < 8 ? 1 :
                                           2;
                let newBarWidth = Math.max(1, newBarWidthTotal - seriesPadding);

                chart.selectAll("g.sub rect").attr("width", newBarWidth);
                barCharts.forEach((barChart, index) => {
                    barChart.setAttribute("transform", "translate(" + ((newBarWidth + seriesPadding) * index) + ", 0)");
                });
            }
        })
    } else if (isHistogramBar) {
        parent.on("renderlet.histogram-bar", function (chart) {
            let barCharts = chart.selectAll(".sub rect:first-child")[0].map(node => node.parentNode.parentNode.parentNode);
            if (barCharts.length > 0) {
                // manually size bars to fill space, minus 1 pixel padding
                const bars = barCharts[0].querySelectorAll("rect");
                let barWidth = parseFloat(bars[0].getAttribute("width"));
                let newBarWidth = parseFloat(bars[1].getAttribute("x")) - parseFloat(bars[0].getAttribute("x")) - 1;
                if (newBarWidth > barWidth) {
                    chart.selectAll("g.sub .bar").attr("width", newBarWidth);
                }

                // shift half of bar width so ticks line up with start of each bar
                for (const barChart of barCharts) {
                    barChart.setAttribute("transform", `translate(${barWidth / 2}, 0)`);
                }
            }
        })
    }

    // HACK: compositeChart + ordinal X axis shenanigans
    if (chartType === "bar") {
        parent._rangeBandPadding(BAR_PADDING_RATIO) // https://github.com/dc-js/dc.js/issues/678
    } else {
        parent._rangeBandPadding(1) // https://github.com/dc-js/dc.js/issues/662
    }

    // x-axis settings
    if (isTimeseries) {
        applyChartTimeseriesXAxis(parent, settings, series, xValues, xDomain, xInterval);
    } else if (isQuantitative) {
        applyChartQuantitativeXAxis(parent, settings, series, xValues, xDomain, xInterval);
    } else {
        applyChartOrdinalXAxis(parent, settings, series, xValues);
    }

    // override tick format for bars. ticks are aligned with beginning of bar, so just show the start value
    if (isHistogramBar) {
        parent.xAxis().tickFormat(d => formatNumber(d));
    }

    // y-axis settings
    let [left, right] = yAxisSplit.map(indexes => ({
        series: indexes.map(index => series[index]),
        extent: d3.extent([].concat(...indexes.map(index => yExtents[index])))
    }));
    if (left && left.series.length > 0) {
        applyChartYAxis(parent, settings, left.series, left.extent, "left");
    }
    if (right && right.series.length > 0) {
        applyChartYAxis(parent, settings, right.series, right.extent, "right");
    }
    const isSplitAxis = (right && right.series.length) && (left && left.series.length > 0);

    applyChartTooltips(parent, series, isStacked, isNormalized, isScalarSeries, (hovered) => {
        // disable tooltips while brushing
        if (onHoverChange && !isBrushing) {
            // disable tooltips on lines
            if (hovered && hovered.element && hovered.element.classList.contains("line")) {
                delete hovered.element;
            }
            onHoverChange(hovered);
        }
    }, onVisualizationClick);

    // render
    parent.render();

    // apply any on-rendering functions
    lineAndBarOnRender(parent, settings, onGoalHover, isSplitAxis, isStacked);

    // only ordinal axis can display "null" values
    if (isOrdinal) {
        delete warnings[NULL_DIMENSION_WARNING];
    }

    onRender && onRender({
        yAxisSplit,
        warnings: Object.keys(warnings)
    });

    return parent;
}

export const lineRenderer    = (element, props) => lineAreaBar(element, { ...props, chartType: "line" });
export const areaRenderer    = (element, props) => lineAreaBar(element, { ...props, chartType: "area" });
export const barRenderer     = (element, props) => lineAreaBar(element, { ...props, chartType: "bar" });
export const scatterRenderer = (element, props) => lineAreaBar(element, { ...props, chartType: "scatter" });
