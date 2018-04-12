import React from "react";

import Toggle from "metabase/components/Toggle.jsx";

import ChartSettingRadio from "./ChartSettingRadio";

const ChartSettingToggle = ({ value, onChange, className, includeAuto }) =>
  includeAuto ? (
    <ChartSettingRadio
      value={value}
      onChange={onChange}
      className={"flex-row"}
      options={[
        { name: "Auto", value: undefined },
        { name: "On", value: true },
        { name: "Off", value: false },
      ]}
    />
  ) : (
    <Toggle value={value} onChange={onChange} />
  );

export default ChartSettingToggle;
