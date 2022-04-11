/* eslint-disable react/prop-types */
import React from "react";

import Toggle from "metabase/core/components/Toggle";

const ChartSettingToggle = ({ value, onChange }) => (
  <Toggle value={value} onChange={onChange} />
);

export default ChartSettingToggle;
