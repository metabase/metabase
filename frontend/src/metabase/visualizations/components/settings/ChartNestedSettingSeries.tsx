/* eslint-disable react/prop-types */
import React from "react";
import ChartNestedSettingSeriesMultiple from "./ChartNestedSettingSeriesMultiple";
import ChartNestedSettingSeriesSingle from "./ChartNestedSettingSeriesSingle";

interface ChartNestedSettingSeriesProps {
  isDashboard: boolean;
}

const ChartNestedSettingSeries = ({
  isDashboard,
  ...props
}: ChartNestedSettingSeriesProps) => {
  console.log(props);
  return isDashboard ? (
    <ChartNestedSettingSeriesMultiple {...props} />
  ) : (
    <ChartNestedSettingSeriesSingle {...props} />
  );
};

export default ChartNestedSettingSeries;
