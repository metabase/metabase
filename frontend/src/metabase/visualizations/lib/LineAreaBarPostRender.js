import d3 from "d3";

import { clipPathReference } from "metabase/lib/dom";

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

// logic for determining the bounding shapes for showing tooltips for a given point.
// Wikipedia has a good explanation here: https://en.wikipedia.org/wiki/Voronoi_diagram
function onRenderVoronoiHover(chart) {
    const parent = chart.svg().select("svg > g");
    const dots = chart.svg().selectAll(".sub .dc-tooltip .dot")[0];

    if (dots.length === 0 || dots.length > VORONOI_MAX_POINTS) {
        return;
    }

    const originRect = chart.svg().node().getBoundingClientRect();
    const vertices = dots.map(e => {
        const { top, left, width, height } = e.getBoundingClientRect();
        const px = (left + width / 2) - originRect.left;
        const py = (top + height / 2) - originRect.top;
        return [px, py, e];
    });

    // HACK Atte Keinänen 8/8/17: For some reason the parent node is not present in Jest/Enzyme tests
    // so simply return empty width and height for preventing the need to do bigger hacks in test code
    const { width, height } = parent.node() ? parent.node().getBBox() : { width: 0, height: 0 };

    const voronoi = d3.geom.voronoi().clipExtent([[0,0], [width, height]]);

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
          // in the functions below e is not an event but the circle element being hovered/clicked
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

        const { x, y, width } = goalLine.getBBox ? goalLine.getBBox() : { x: 0, y: 0, width: 0 };

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
             .on("mouseleave", function() { onGoalHover(null); });
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
    const mins = computeMinHorizontalMargins(chart);

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

// +-------------------------------------------------------------------------------------------------------------------+
// |                                              PUTTING IT ALL TOGETHER                                              |
// +-------------------------------------------------------------------------------------------------------------------+

/// once chart has rendered and we can access the SVG, do customizations to axis labels / etc that you can't do through dc.js
export default function lineAndBarOnRender(chart, settings, onGoalHover, isSplitAxis, isStacked) {
    beforeRender(chart, settings);
    chart.on("renderlet.on-render", () => onRender(chart, settings, onGoalHover, isSplitAxis, isStacked));
    chart.render();
}
