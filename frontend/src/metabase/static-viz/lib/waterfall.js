import d3 from "d3";
import { formatDate } from "./dates";

const WATERFALL_TOTAL = "Total";

export const calculateWaterfallEntries = (data, accessors, showTotal) => {
  let total = 0;

  const entries = data.map(datum => {
    const xValue = accessors.x(datum);
    const yValue = accessors.y(datum);

    const prevTotal = total;
    total += yValue;

    return {
      x: xValue,
      y: yValue,
      start: prevTotal,
      end: total,
    };
  });

  if (showTotal) {
    entries.push({
      x: WATERFALL_TOTAL,
      y: total,
      start: 0,
      end: total,
      isTotal: true,
    });
  }

  return entries;
};

export const formatTimescaleWaterfallTick = (value, settings) =>
  value === WATERFALL_TOTAL ? WATERFALL_TOTAL : formatDate(value, settings?.x);

export const calculateWaterfallDomain = entries => {
  const values = entries.flatMap(entry => [entry.start, entry.end]);
  return d3.extent(values);
};

export const getWaterfallEntryColor = (entry, palette) => {
  if (entry.isTotal) {
    return palette.waterfallTotal;
  }

  return entry.y > 0 ? palette.waterfallPositive : palette.waterfallNegative;
};
