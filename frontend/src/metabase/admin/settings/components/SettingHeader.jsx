import React from "react";

const SettingHeader = ({ setting }) => (
  <div>
    <div className="text-medium text-bold text-uppercase">
      {setting.display_name}
    </div>
    <div className="text-medium text-measure my1">
      {setting.description}
      {setting.note && <div>{setting.note}</div>}
    </div>
  </div>
);

export default SettingHeader;
