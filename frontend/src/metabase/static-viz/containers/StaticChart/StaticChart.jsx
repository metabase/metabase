import React from "react";
import PropTypes from "prop-types";
import CategoricalBarChart from "../../components/CategoricalBarChart";
import CategoricalDonutChart from "../../components/CategoricalDonutChart";
import TimeSeriesBarChart from "../../components/TimeSeriesBarChart";
import TimeSeriesLineChart from "../../components/TimeSeriesLineChart";

const propTypes = {
  type: PropTypes.oneOf([
    "categorical/bar",
    "categorical/donut",
    "timeseries/bar",
    "timeseries/line",
  ]).isRequired,
  options: PropTypes.object.isRequired,
};

const StaticChart = ({ type, options }) => {
  switch (type) {
    case "categorical/bar":
      return <CategoricalBarChart {...options} />;
    case "categorical/donut":
      return <CategoricalDonutChart {...options} />;
    case "timeseries/bar":
      return <TimeSeriesBarChart {...options} />;
    case "timeseries/line":
      return <TimeSeriesLineChart {...options} />;
  }
};

StaticChart.propTypes = propTypes;

export default StaticChart;
