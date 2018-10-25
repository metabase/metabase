import React from "react";

import Radio from "metabase/components/Radio.jsx";

const ChartSettingRadio = ({ value, onChange, options = [], className }) => (
  <Radio
    className={className}
    value={value}
    onChange={onChange}
    options={options}
    vertical
  />
);

export default ChartSettingRadio;
