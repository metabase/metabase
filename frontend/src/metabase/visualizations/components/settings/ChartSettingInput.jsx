import React from "react";

const ChartSettingInput = ({ value, onChange }) => (
  <input
    className="input block full"
    value={value}
    onChange={e => onChange(e.target.value)}
  />
);

export default ChartSettingInput;
