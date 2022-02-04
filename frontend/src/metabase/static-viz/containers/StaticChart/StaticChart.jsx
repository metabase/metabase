import React from "react";
import PropTypes from "prop-types";
import CategoricalAreaChart from "../../components/CategoricalAreaChart";
import CategoricalBarChart from "../../components/CategoricalBarChart";
import CategoricalDonutChart from "../../components/CategoricalDonutChart";
import CategoricalLineChart from "../../components/CategoricalLineChart";
import CategoricalWaterfallChart from "../../components/CategoricalWaterfallChart";
import TimeSeriesAreaChart from "../../components/TimeSeriesAreaChart";
import TimeSeriesBarChart from "../../components/TimeSeriesBarChart";
import TimeSeriesLineChart from "../../components/TimeSeriesLineChart";
import ProgressBar from "../../components/ProgressBar";
import Funnel from "../../components/FunnelChart";
import TimeSeriesWaterfallChart from "../../components/TimeSeriesWaterfallChart";
import LineAreaBarChart from "../../components/LineAreaBarChart";

import { assoc } from "icepick";

import { getColorsForValues } from "metabase/lib/colors";

const propTypes = {
  type: PropTypes.oneOf([
    "categorical/area",
    "categorical/bar",
    "categorical/donut",
    "categorical/line",
    "categorical/waterfall",
    "timeseries/area",
    "timeseries/bar",
    "timeseries/line",
    "timeseries/waterfall",
    "progress",
    "combo-chart",
    "funnel",
  ]).isRequired,
  options: PropTypes.object.isRequired,
};

const colorOptions = options => {
  const series = options["series"] || [];
  const colors = series.map(elem => elem["color"]);
  const names = series.map(elem => elem["name"]);
  // coerce to the {seriesName: color} format for object
  const colorObj = names.reduce(
    (obj, k, i) => ({ ...obj, [k]: colors[i] }),
    {},
  );
  // filter out null values
  const assignedColorObj = Object.entries(colorObj).reduce(
    (a, [key, val]) => (val ? ((a[key] = val), a) : a),
    {},
  );
  const filledColorObj = getColorsForValues(names, assignedColorObj);
  const newSeries = series.map(elem =>
    assoc(elem, "color", filledColorObj[elem["name"]]),
  );
  return assoc(options, "series", newSeries);
};

const StaticChart = ({ type, options }) => {
  const coloredOptions = colorOptions(options);
  switch (type) {
    case "categorical/area":
      return <CategoricalAreaChart {...coloredOptions} />;
    case "categorical/bar":
      return <CategoricalBarChart {...coloredOptions} />;
    case "categorical/donut":
      return <CategoricalDonutChart {...coloredOptions} />;
    case "categorical/line":
      return <CategoricalLineChart {...coloredOptions} />;
    case "categorical/waterfall":
      return <CategoricalWaterfallChart {...coloredOptions} />;
    case "timeseries/area":
      return <TimeSeriesAreaChart {...coloredOptions} />;
    case "timeseries/bar":
      return <TimeSeriesBarChart {...coloredOptions} />;
    case "timeseries/line":
      return <TimeSeriesLineChart {...coloredOptions} />;
    case "timeseries/waterfall":
      return <TimeSeriesWaterfallChart {...coloredOptions} />;
    case "progress":
      return <ProgressBar {...coloredOptions} />;
    case "combo-chart":
      return <LineAreaBarChart {...coloredOptions} />;
    case "funnel":
      return <Funnel {...coloredOptions} />;
  }
};

StaticChart.propTypes = propTypes;

export default StaticChart;
