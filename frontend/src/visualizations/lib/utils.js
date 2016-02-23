
import _ from "underscore";
import d3 from "d3";

import * as colors from "metabase/lib/colors";

const SPLIT_AXIS_UNSPLIT_COST = -100;
const SPLIT_AXIS_COST_FACTOR = 2;

// computed size properties (drop 'px' and convert string -> Number)
function getComputedSizeProperty(prop, element) {
    var val = document.defaultView.getComputedStyle(element, null).getPropertyValue(prop);
    return val ? parseFloat(val.replace("px", "")) : null;
}

/// height available for rendering the card
export function getAvailableCanvasHeight(element) {
    var parent = element.parentElement,
        parentHeight = getComputedSizeProperty("height", parent),
        parentPaddingTop = getComputedSizeProperty("padding-top", parent),
        parentPaddingBottom = getComputedSizeProperty("padding-bottom", parent);

    // NOTE: if this magic number is not 3 we can get into infinite re-render loops
    return parentHeight - parentPaddingTop - parentPaddingBottom - 3; // why the magic number :/
}

/// width available for rendering the card
export function getAvailableCanvasWidth(element) {
    var parent = element.parentElement,
        parentWidth = getComputedSizeProperty("width", parent),
        parentPaddingLeft = getComputedSizeProperty("padding-left", parent),
        parentPaddingRight = getComputedSizeProperty("padding-right", parent);

    return parentWidth - parentPaddingLeft - parentPaddingRight;
}

function generateSplits(list, left = [], right = []) {
    // NOTE: currently generates all permutations, some of which are equivalent
    if (list.length === 0) {
        return [[left, right]];
    } else {
        return [
            ...generateSplits(list.slice(1), left.concat([list[0]]), right),
            ...generateSplits(list.slice(1), left, right.concat([list[0]]))
        ];
    }
}

function cost(seriesExtents) {
    let axisExtent = d3.extent([].concat(...seriesExtents)); // concat to flatten the array
    let axisRange = axisExtent[1] - axisExtent[0];
    if (seriesExtents.length === 0) {
        return SPLIT_AXIS_UNSPLIT_COST;
    } else if (axisRange === 0) {
        return 0;
    } else {
        return seriesExtents.reduce((sum, seriesExtent) =>
            sum + Math.pow(axisRange / (seriesExtent[1] - seriesExtent[0]), SPLIT_AXIS_COST_FACTOR)
        , 0);
    }
}

export function computeSplit(extents) {
    let best, bestCost;
    let splits = generateSplits(extents.map((e,i) => i)).map(split =>
        [split, cost(split[0].map(i => extents[i])) + cost(split[1].map(i => extents[i]))]
    );
    for (let [split, splitCost] of splits) {
        if (!best || splitCost < bestCost) {
            best = split;
            bestCost = splitCost;
        }
    }
    return best.sort((a,b) => a[0] - b[0]);
}

const FRIENDLY_NAME_MAP = {
    "avg": "Average",
    "count": "Count",
    "sum": "Sum",
    "distinct": "Distinct",
    "stddev": "Standard Deviation"
};

export function getFriendlyName(col) {
    let name = col.display_name || col.name;
    let friendlyName = FRIENDLY_NAME_MAP[name.toLowerCase().trim()];
    return friendlyName || name;
}

export function getCardColors(card) {
    let settings = card.visualization_settings;
    let chartColor, chartColorList;
    if (card.display === "bar" && settings.bar) {
        chartColor = settings.bar.color;
        chartColorList = settings.bar.colors;
    } else if (card.display !== "bar" && settings.line) {
        chartColor = settings.line.lineColor;
        chartColorList = settings.line.colors;
    }
    return _.uniq([chartColor || Object.values(colors.normal)[0]].concat(chartColorList || Object.values(colors.normal)));
}

export function isSameSeries(seriesA, seriesB) {
    return (seriesA && seriesA.length) === (seriesB && seriesB.length) &&
        _.zip(seriesA, seriesB).reduce((acc, [a, b]) => {
            let sameData = a.data === b.data;
            let sameDisplay = (a.card && a.card.display) === (b.card && b.card.display);
            let sameVizSettings = (a.card && JSON.stringify(a.card.visualization_settings)) === (b.card && JSON.stringify(b.card.visualization_settings));
            return acc && (sameData && sameDisplay && sameVizSettings);
        }, true);
}

export function colorShades(color, count) {
    return _.range(count).map(i => colorShade(color, 1 - Math.min(0.25, 1 / count) * i))
}

export function colorShade(hex, shade = 0) {
    let match = hex.match(/#(?:(..)(..)(..)|(.)(.)(.))/);
    if (!match) {
        return hex;
    }
    let components = (match[1] != null ? match.slice(1,4) : match.slice(4,7)).map((d) => parseInt(d, 16))
    let min = Math.min(...components);
    let max = Math.max(...components);
    return "#" + components.map(c =>
        Math.round(min + (max - min) * shade * (c / 255)).toString(16)
    ).join("");
}
