import React from "react";

const SettingHeader = ({ setting }) => (
  <div>
    <h3>{setting.display_name}</h3>
    <div className="text-medium text-measure my1">
      {setting.description}
      {setting.note && <div>{setting.note}</div>}
    </div>
  </div>
);

export default SettingHeader;
