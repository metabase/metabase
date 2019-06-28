import d3 from "d3";
import _ from "underscore";

import { isStacked } from "./renderer_utils";
import { computeSplit } from "./utils";

function getYAxisSplit(series, settings) {
  const datas = series.map(s => s.data.rows);
  const yExtents = datas.map(d => d3.extent(d.map(row => row[1])));

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

export default getYAxisSplit;
