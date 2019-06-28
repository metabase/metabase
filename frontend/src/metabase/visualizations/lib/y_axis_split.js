import d3 from "d3";
import _ from "underscore";

import { isStacked } from "./renderer_utils";

export default function getYAxisSplit(series, settings) {
  const datas = series.map(s => s.data.rows);

  const cardType = series[0].card.display;

  const seriesAxis = series.map(single => settings.series(single)["axis"]);
  const left = [];
  const right = [];
  const auto = [];
  for (const [index, axis] of seriesAxis.entries()) {
    if (axis === "left") {
      left.push(index);
    } else if (axis === "right") {
      right.push(index);
    } else {
      auto.push(index);
    }
  }

  // don't auto-split if the metric columns are all identical, i.e. it's a breakout multiseries
  const hasDifferentYAxisColumns =
    _.uniq(series.map(s => JSON.stringify(s.data.cols[1]))).length > 1;
  if (
    cardType !== "scatter" &&
    cardType !== "funnel" &&
    !isStacked(settings, datas) &&
    hasDifferentYAxisColumns &&
    settings["graph.y_axis.auto_split"] !== false
  ) {
    // NOTE: this version computes a split with all axis unassigned, then moves
    // assigned ones to their correct axis

    // This definition of yExtents is only valid for charts besides scatter
    // plots that are not normalized
    const yExtents = datas.map(d => d3.extent(d.map(row => row[1])));
    const [autoLeft, autoRight] = computeSplit(yExtents);
    return [
      _.uniq([...left, ...autoLeft.filter(index => !seriesAxis[index])]),
      _.uniq([...right, ...autoRight.filter(index => !seriesAxis[index])]),
    ];
  } else {
    // assign all auto to the left
    return [[...left, ...auto], right];
  }
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

const SPLIT_AXIS_UNSPLIT_COST = -100;
const SPLIT_AXIS_COST_FACTOR = 2;

function axisCost(seriesExtents, favorUnsplit = true) {
  const axisExtent = d3.extent([].concat(...seriesExtents)); // concat to flatten the array
  const axisRange = axisExtent[1] - axisExtent[0];
  if (favorUnsplit && seriesExtents.length === 0) {
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

// only exported for testing
export function computeSplit(extents, left = [], right = []) {
  const unassigned = extents
    .map((e, i) => i)
    .filter(i => left.indexOf(i) < 0 && right.indexOf(i) < 0);

  // if any are assigned to right we have decided to split so don't favor unsplit
  const favorUnsplit = right.length > 0;

  const cost = split =>
    axisCost(split[0].map(i => extents[i]), favorUnsplit) +
    axisCost(split[1].map(i => extents[i]), favorUnsplit);

  const splits = generateSplits(unassigned, left, right);

  let best, bestCost;
  for (const split of splits) {
    const splitCost = cost(split);
    if (!best || splitCost < bestCost) {
      best = split;
      bestCost = splitCost;
    }
  }

  // don't sort if we provided an initial left/right
  if (left.length > 0 || right.length > 0) {
    return best;
  } else {
    return best && best.sort((a, b) => a[0] - b[0]);
  }
}
