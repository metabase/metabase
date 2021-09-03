import React from "react";
import PropTypes from "prop-types";
import CategoricalBarChart from "../../components/CategoricalBarChart";
import CategoricalDonutChart from "../../components/CategoricalDonutChart";
import TimeSeriesAreaChart from "../../components/TimeSeriesAreaChart";
import TimeSeriesBarChart from "../../components/TimeSeriesBarChart";
import TimeSeriesLineChart from "../../components/TimeSeriesLineChart";
import TimeSeriesMultiChart from "../../components/TimeSeriesMultiChart";

const propTypes = {
  type: PropTypes.oneOf([
    "categorical/bar",
    "categorical/donut",
    "timeseries/area",
    "timeseries/bar",
    "timeseries/line",
    "timeseries/multiple",
  ]).isRequired,
  options: PropTypes.object.isRequired,
};

const StaticChart = ({ type, options }) => {
  switch (type) {
    case "categorical/bar":
      return <CategoricalBarChart {...options} />;
    case "categorical/donut":
      return <CategoricalDonutChart {...options} />;
    case "timeseries/area":
      return <TimeSeriesAreaChart {...options} />;
    case "timeseries/bar":
      return <TimeSeriesBarChart {...options} />;
    case "timeseries/line":
      return <TimeSeriesLineChart {...options} />;
    case "timeseries/multiple":
      return <TimeSeriesMultiChart {...options} />;
  }
};

StaticChart.propTypes = propTypes;

export default StaticChart;
