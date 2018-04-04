/* @flow weak */

import React from "react";
import _ from "underscore";
import d3 from "d3";
import { t } from "c-3po";
import crossfilter from "crossfilter";

import * as colors from "metabase/lib/colors";

const SPLIT_AXIS_UNSPLIT_COST = -100;
const SPLIT_AXIS_COST_FACTOR = 2;

// NOTE Atte Keinänen 8/3/17: Moved from settings.js because this way we
// are able to avoid circular dependency errors in integrated tests
export function columnsAreValid(colNames, data, filter = () => true) {
  if (typeof colNames === "string") {
    colNames = [colNames];
  }
  if (!data || !Array.isArray(colNames)) {
    return false;
  }
  const colsByName = {};
  for (const col of data.cols) {
    colsByName[col.name] = col;
  }
  return colNames.reduce(
    (acc, name) =>
      acc &&
      (name == undefined || (colsByName[name] && filter(colsByName[name]))),
    true,
  );
}

// computed size properties (drop 'px' and convert string -> Number)
function getComputedSizeProperty(prop, element) {
  const val = document.defaultView
    .getComputedStyle(element, null)
    .getPropertyValue(prop);
  return val ? parseFloat(val.replace("px", "")) : 0;
}

/// height available for rendering the card
export function getAvailableCanvasHeight(element) {
  const parent = element.parentElement;
  const parentHeight = getComputedSizeProperty("height", parent);
  const parentPaddingTop = getComputedSizeProperty("padding-top", parent);
  const parentPaddingBottom = getComputedSizeProperty("padding-bottom", parent);

  // NOTE: if this magic number is not 3 we can get into infinite re-render loops
  return parentHeight - parentPaddingTop - parentPaddingBottom - 3; // why the magic number :/
}

/// width available for rendering the card
export function getAvailableCanvasWidth(element) {
  const parent = element.parentElement;
  const parentWidth = getComputedSizeProperty("width", parent);
  const parentPaddingLeft = getComputedSizeProperty("padding-left", parent);
  const parentPaddingRight = getComputedSizeProperty("padding-right", parent);

  return parentWidth - parentPaddingLeft - parentPaddingRight;
}

function generateSplits(list, left = [], right = []) {
  // NOTE: currently generates all permutations, some of which are equivalent
  if (list.length === 0) {
    return [[left, right]];
  } else {
    return [
      ...generateSplits(list.slice(1), left.concat([list[0]]), right),
      ...generateSplits(list.slice(1), left, right.concat([list[0]])),
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
    return seriesExtents.reduce(
      (sum, seriesExtent) =>
        sum +
        Math.pow(
          axisRange / (seriesExtent[1] - seriesExtent[0]),
          SPLIT_AXIS_COST_FACTOR,
        ),
      0,
    );
  }
}

export function computeSplit(extents) {
  let best, bestCost;
  let splits = generateSplits(extents.map((e, i) => i)).map(split => [
    split,
    cost(split[0].map(i => extents[i])) + cost(split[1].map(i => extents[i])),
  ]);
  for (let [split, splitCost] of splits) {
    if (!best || splitCost < bestCost) {
      best = split;
      bestCost = splitCost;
    }
  }
  return best && best.sort((a, b) => a[0] - b[0]);
}

const FRIENDLY_NAME_MAP = {
  avg: t`Average`,
  count: t`Count`,
  sum: t`Sum`,
  distinct: t`Distinct`,
  stddev: t`Standard Deviation`,
};

export function getXValues(datas, chartType) {
  let xValues = _.chain(datas)
    .map(data => _.pluck(data, "0"))
    .flatten(true)
    .uniq()
    .value();

  // detect if every series' dimension is strictly ascending or descending and use that to sort xValues
  let isAscending = true;
  let isDescending = true;
  outer: for (const rows of datas) {
    for (let i = 1; i < rows.length; i++) {
      isAscending = isAscending && rows[i - 1][0] <= rows[i][0];
      isDescending = isDescending && rows[i - 1][0] >= rows[i][0];
      if (!isAscending && !isDescending) {
        break outer;
      }
    }
  }
  if (isDescending) {
    // JavaScript's .sort() sorts lexicographically by default (e.x. 1, 10, 2)
    // We could implement a comparator but _.sortBy handles strings, numbers, and dates correctly
    xValues = _.sortBy(xValues, x => x).reverse();
  } else if (isAscending) {
    // default line/area charts to ascending since otherwise lines could be wonky
    xValues = _.sortBy(xValues, x => x);
  }
  return xValues;
}

export function getFriendlyName(column) {
  if (column.display_name && column.display_name !== column.name) {
    return column.display_name;
  } else {
    // NOTE Atte Keinänen 8/7/17:
    // Values `display_name` and `name` are same for breakout columns so check FRIENDLY_NAME_MAP
    // before returning either `display_name` or `name`
    return (
      FRIENDLY_NAME_MAP[column.name.toLowerCase().trim()] ||
      column.display_name ||
      column.name
    );
  }
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
  return _.uniq(
    [chartColor || Object.values(colors.harmony)[0]].concat(
      chartColorList || Object.values(colors.harmony),
    ),
  );
}

export function isSameSeries(seriesA, seriesB) {
  return (
    (seriesA && seriesA.length) === (seriesB && seriesB.length) &&
    _.zip(seriesA, seriesB).reduce((acc, [a, b]) => {
      let sameData = a.data === b.data;
      let sameDisplay =
        (a.card && a.card.display) === (b.card && b.card.display);
      let sameVizSettings =
        (a.card && JSON.stringify(a.card.visualization_settings)) ===
        (b.card && JSON.stringify(b.card.visualization_settings));
      return acc && (sameData && sameDisplay && sameVizSettings);
    }, true)
  );
}

export function colorShades(color, count) {
  return _.range(count).map(i =>
    colorShade(color, 1 - Math.min(0.25, 1 / count) * i),
  );
}

export function colorShade(hex, shade = 0) {
  let match = hex.match(/#(?:(..)(..)(..)|(.)(.)(.))/);
  if (!match) {
    return hex;
  }
  let components = (match[1] != null
    ? match.slice(1, 4)
    : match.slice(4, 7)
  ).map(d => parseInt(d, 16));
  let min = Math.min(...components);
  let max = Math.max(...components);
  return (
    "#" +
    components
      .map(c => Math.round(min + (max - min) * shade * (c / 255)).toString(16))
      .join("")
  );
}

import { isDimension, isMetric } from "metabase/lib/schema_metadata";

export const DIMENSION_METRIC = "DIMENSION_METRIC";
export const DIMENSION_METRIC_METRIC = "DIMENSION_METRIC_METRIC";
export const DIMENSION_DIMENSION_METRIC = "DIMENSION_DIMENSION_METRIC";

// NOTE Atte Keinänen 7/31/17 Commented MAX_SERIES out as it wasn't being used
// const MAX_SERIES = 10;

export const isDimensionMetric = (cols, strict = true) =>
  (!strict || cols.length === 2) && isDimension(cols[0]) && isMetric(cols[1]);

export const isDimensionDimensionMetric = (cols, strict = true) =>
  (!strict || cols.length === 3) &&
  isDimension(cols[0]) &&
  isDimension(cols[1]) &&
  isMetric(cols[2]);

export const isDimensionMetricMetric = (cols, strict = true) =>
  cols.length >= 3 &&
  isDimension(cols[0]) &&
  cols.slice(1).reduce((acc, col) => acc && isMetric(col), true);

// cache computed cardinalities in a weak map since they are computationally expensive
const cardinalityCache = new WeakMap();

export function getColumnCardinality(cols, rows, index) {
  const col = cols[index];
  if (!cardinalityCache.has(col)) {
    let dataset = crossfilter(rows);
    cardinalityCache.set(
      col,
      dataset
        .dimension(d => d[index])
        .group()
        .size(),
    );
  }
  return cardinalityCache.get(col);
}

export function getChartTypeFromData(cols, rows, strict = true) {
  // this should take precendence for backwards compatibilty
  if (isDimensionMetricMetric(cols, strict)) {
    return DIMENSION_METRIC_METRIC;
  } else if (isDimensionDimensionMetric(cols, strict)) {
    // if (getColumnCardinality(cols, rows, 0) < MAX_SERIES || getColumnCardinality(cols, rows, 1) < MAX_SERIES) {
    return DIMENSION_DIMENSION_METRIC;
    // }
  } else if (isDimensionMetric(cols, strict)) {
    return DIMENSION_METRIC;
  }
  return null;
}

export function enableVisualizationEasterEgg(
  code,
  OriginalVisualization,
  EasterEggVisualization,
) {
  if (!code) {
    code = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
  } else if (typeof code === "string") {
    code = code.split("").map(c => c.charCodeAt(0));
  }
  wrapMethod(
    OriginalVisualization.prototype,
    "componentWillMount",
    function easterEgg() {
      let keypresses = [];
      let enabled = false;
      let render_original = this.render;
      let render_egg = function() {
        return <EasterEggVisualization {...this.props} />;
      };
      this._keyListener = e => {
        keypresses = keypresses.concat(e.keyCode).slice(-code.length);
        if (
          code.reduce(
            (ok, value, index) => ok && value === keypresses[index],
            true,
          )
        ) {
          enabled = !enabled;
          this.render = enabled ? render_egg : render_original;
          this.forceUpdate();
        }
      };
      window.addEventListener("keyup", this._keyListener, false);
    },
  );
  wrapMethod(
    OriginalVisualization.prototype,
    "componentWillUnmount",
    function cleanupEasterEgg() {
      window.removeEventListener("keyup", this._keyListener, false);
    },
  );
}

function wrapMethod(object, name, method) {
  let method_original = object[name];
  object[name] = function() {
    method.apply(this, arguments);
    if (typeof method_original === "function") {
      return method_original.apply(this, arguments);
    }
  };
}
// TODO Atte Keinänen 5/30/17 Extract to metabase-lib card/question logic
export const cardHasBecomeDirty = (nextCard, previousCard) =>
  !_.isEqual(previousCard.dataset_query, nextCard.dataset_query) ||
  previousCard.display !== nextCard.display;

export function getCardAfterVisualizationClick(nextCard, previousCard) {
  if (cardHasBecomeDirty(nextCard, previousCard)) {
    const isMultiseriesQuestion = !nextCard.id;
    const alreadyHadLineage = !!previousCard.original_card_id;

    return {
      ...nextCard,
      // Original card id is needed for showing the "started from" lineage in dirty cards.
      original_card_id: alreadyHadLineage
        ? // Just recycle the original card id of previous card if there was one
          previousCard.original_card_id
        : // A multi-aggregation or multi-breakout series legend / drill-through action
          // should always use the id of underlying/previous card
          isMultiseriesQuestion ? previousCard.id : nextCard.id,
    };
  } else {
    // Even though the card is currently clean, we might still apply dashboard parameters to it,
    // so add the original_card_id to ensure a correct behavior in that context
    return {
      ...nextCard,
      original_card_id: nextCard.id,
    };
  }
}
