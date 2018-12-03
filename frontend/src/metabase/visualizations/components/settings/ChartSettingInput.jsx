import React from "react";

const ChartSettingInput = ({ value, onChange, ...props }) => (
  <input
    {...props}
    className="input block full"
    value={value}
    onChange={e => onChange(e.target.value)}
  />
);

export default ChartSettingInput;
