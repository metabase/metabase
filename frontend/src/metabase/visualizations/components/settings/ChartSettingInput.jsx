import React from "react";

import InputBlurChange from "metabase/components/InputBlurChange";

const ChartSettingInput = ({ value, onChange, ...props }) => (
  <InputBlurChange
    {...props}
    className="input block full"
    value={value}
    onBlurChange={e => onChange(e.target.value)}
  />
);

export default ChartSettingInput;
