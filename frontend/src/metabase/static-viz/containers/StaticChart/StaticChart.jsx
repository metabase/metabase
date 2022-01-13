import React from "react";
import PropTypes from "prop-types";
import CategoricalDonutChart from "../../components/CategoricalDonutChart";
import CategoricalWaterfallChart from "../../components/CategoricalWaterfallChart";
import ProgressBar from "../../components/ProgressBar";
import Funnel from "../../components/FunnelChart";
import TimeSeriesWaterfallChart from "../../components/TimeSeriesWaterfallChart";
import LineAreaBarChart from "../../components/LineAreaBarChart";

const propTypes = {
  type: PropTypes.oneOf([
    "categorical/donut",
    "categorical/waterfall",
    "timeseries/waterfall",
    "progress",
    "combo-chart",
    "funnel",
  ]).isRequired,
  options: PropTypes.object.isRequired,
};

const StaticChart = ({ type, options }) => {
  switch (type) {
    case "categorical/donut":
      return <CategoricalDonutChart {...options} />;
    case "categorical/waterfall":
      return <CategoricalWaterfallChart {...options} />;
    case "timeseries/waterfall":
      return <TimeSeriesWaterfallChart {...options} />;
    case "progress":
      return <ProgressBar {...options} />;
    case "combo-chart":
      return <LineAreaBarChart {...options} />;
    case "funnel":
      return <Funnel {...options} />;
  }
};

StaticChart.propTypes = propTypes;

export default StaticChart;
