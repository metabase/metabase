import React from "react";

import Toggle from "metabase/components/Toggle.jsx";

const ChartSettingToggle = ({ value, onChange }) => (
  <Toggle value={value} onChange={onChange} />
);

export default ChartSettingToggle;
