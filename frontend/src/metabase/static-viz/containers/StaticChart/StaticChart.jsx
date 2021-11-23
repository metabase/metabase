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
import TimeSeriesWaterfallChart from "../../components/TimeSeriesWaterfallChart";
import LineAreaBarChart from "../../components/LineAreaBarChart";

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
  ]).isRequired,
  options: PropTypes.object.isRequired,
};

const StaticChart = ({ type, options }) => {
  switch (type) {
    case "categorical/area":
      return <CategoricalAreaChart {...options} />;
    case "categorical/bar":
      return <CategoricalBarChart {...options} />;
    case "categorical/donut":
      return <CategoricalDonutChart {...options} />;
    case "categorical/line":
      return <CategoricalLineChart {...options} />;
    case "categorical/waterfall":
      return <CategoricalWaterfallChart {...options} />;
    case "timeseries/area":
      return <TimeSeriesAreaChart {...options} />;
    case "timeseries/bar":
      return <TimeSeriesBarChart {...options} />;
    case "timeseries/line":
      return <TimeSeriesLineChart {...options} />;
    case "timeseries/waterfall":
      return <TimeSeriesWaterfallChart {...options} />;
    case "progress":
      return <ProgressBar {...options} />;
    case "combo-chart":
      return <LineAreaBarChart {...options} />;
  }
};

StaticChart.propTypes = propTypes;

export default StaticChart;
