import React from "react";

import ColorPicker from "metabase/components/ColorPicker";

const SettingColor = ({ setting, onChange }) => (
  <ColorPicker value={setting.value || setting.default} onChange={onChange} />
);

export default SettingColor;
