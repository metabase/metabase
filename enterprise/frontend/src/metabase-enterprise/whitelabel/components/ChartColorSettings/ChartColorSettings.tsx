import React from "react";

export interface ChartColorSettingsProps {
  colors: Record<string, string>;
}

const ChartColorSettings = (): JSX.Element => {
  return <ChartColorTable />;
};

const ChartColorTable = (): JSX.Element => {
  return <div />;
};

export default ChartColorSettings;
