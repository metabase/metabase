// code for filling in the missing values in a set of "datas"

import { t } from "ttag";
import d3 from "d3";

import {
  isTimeseries,
  isQuantitative,
  isHistogram,
  isHistogramBar,
} from "./renderer_utils";
import timeseriesScale from "./timeseriesScale";

// max number of points to "fill"
// TODO: base on pixel width of chart?
const MAX_FILL_COUNT = 10000;

function fillMissingValues(rows, xValues, fillValue, getKey = v => v) {
  try {
    const fillValues = rows[0].slice(1).map(d => fillValue);

    const map = new Map();
    for (const row of rows) {
      map.set(getKey(row[0]), row);
    }
    const newRows = xValues.map(value => {
      const key = getKey(value);
      const row = map.get(key);
      if (row) {
        map.delete(key);
        const newRow = [value, ...row.slice(1)];
        newRow._origin = row._origin;
        return newRow;
      } else {
        return [value, ...fillValues];
      }
    });
    if (map.size > 0) {
      console.warn(t`xValues missing!`, map, newRows);
    }
    return newRows;
  } catch (e) {
    console.warn(e);
    return rows;
  }
}

function fillMissingValuesInData(
  props,
  { xValues, xDomain, xInterval },
  singleSeries,
  rows,
) {
  const { settings } = props;
  const { "line.missing": lineMissing } = settings.series(singleSeries);

  // return now if we're not filling with either 0 or null
  if (!(lineMissing === "zero" || lineMissing === "none")) {
    return rows;
  }
  let getKey;
  const fillValue = lineMissing === "zero" ? 0 : null;
  if (isTimeseries(settings)) {
    const count = Math.abs(
      xDomain[1].diff(xDomain[0], xInterval.interval) / xInterval.count,
    );
    if (count > MAX_FILL_COUNT) {
      return rows;
    }

    xValues = timeseriesScale(xInterval)
      .domain(xDomain)
      .ticks();
    getKey = m => m.toISOString();
  } else if (isQuantitative(settings) || isHistogram(settings)) {
    const count = Math.abs((xDomain[1] - xDomain[0]) / xInterval);
    if (count > MAX_FILL_COUNT) {
      return rows;
    }
    let [start, end] = xDomain;
    if (isHistogramBar(props)) {
      // NOTE: intentionally add an end point for bar histograms
      end += xInterval * 1.5;
    } else {
      // NOTE: avoid including endpoint due to floating point error
      end += xInterval * 0.5;
    }
    xValues = d3.range(start, end, xInterval);
    // NOTE: normalize to xInterval to avoid floating point issues
    getKey = v => Math.round(v / xInterval);
  }
  return fillMissingValues(rows, xValues, fillValue, getKey);
}

export default function fillMissingValuesInDatas(
  props,
  { xValues, xDomain, xInterval },
  datas,
) {
  return datas.map((rows, index) =>
    fillMissingValuesInData(
      props,
      { xValues, xDomain, xInterval },
      props.series[index],
      rows,
    ),
  );
}
