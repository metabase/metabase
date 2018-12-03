// code for filling in the missing values in a set of "datas"

import { t } from "c-3po";
import d3 from "d3";
import moment from "moment";

import {
  isTimeseries,
  isQuantitative,
  isHistogram,
  isHistogramBar,
} from "./renderer_utils";

// max number of points to "fill"
// TODO: base on pixel width of chart?
const MAX_FILL_COUNT = 10000;

function fillMissingValues(rows, xValues, fillValue, getKey = v => v) {
  try {
    const fillValues = rows[0].slice(1).map(d => fillValue);

    let map = new Map();
    for (const row of rows) {
      map.set(getKey(row[0]), row);
    }
    let newRows = xValues.map(value => {
      const key = getKey(value);
      const row = map.get(key);
      if (row) {
        map.delete(key);
        return [value, ...row.slice(1)];
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
  seriesSettings,
  rows,
) {
  const { settings } = props;
  if (
    seriesSettings["line.missing"] === "zero" ||
    seriesSettings["line.missing"] === "none"
  ) {
    const fillValue = seriesSettings["line.missing"] === "zero" ? 0 : null;
    if (isTimeseries(settings)) {
      // $FlowFixMe
      const { interval, count } = xInterval;
      if (count <= MAX_FILL_COUNT) {
        // replace xValues with
        xValues = d3.time[interval]
          .range(xDomain[0], moment(xDomain[1]).add(1, "ms"), count)
          .map(d => moment(d));
        return fillMissingValues(
          rows,
          xValues,
          fillValue,
          m => d3.round(m.toDate().getTime(), -1), // sometimes rounds up 1ms?
        );
      }
    }
    if (isQuantitative(settings) || isHistogram(settings)) {
      // $FlowFixMe
      const count = Math.abs((xDomain[1] - xDomain[0]) / xInterval);
      if (count <= MAX_FILL_COUNT) {
        let [start, end] = xDomain;
        if (isHistogramBar(props)) {
          // NOTE: intentionally add an end point for bar histograms
          // $FlowFixMe
          end += xInterval * 1.5;
        } else {
          // NOTE: avoid including endpoint due to floating point error
          // $FlowFixMe
          end += xInterval * 0.5;
        }
        xValues = d3.range(start, end, xInterval);
        return fillMissingValues(
          rows,
          xValues,
          fillValue,
          // NOTE: normalize to xInterval to avoid floating point issues
          v => Math.round(v / xInterval),
        );
      }
    } else {
      return fillMissingValues(rows, xValues, fillValue);
    }
  } else {
    return rows;
  }
}

export default function fillMissingValuesInDatas(
  props,
  { xValues, xDomain, xInterval },
  datas,
) {
  const { series, settings } = props;
  return datas.map((rows, index) => {
    const seriesSettings = settings.series(series[index]);
    return fillMissingValuesInData(
      props,
      { xValues, xDomain, xInterval },
      seriesSettings,
      rows,
    );
  });
}
