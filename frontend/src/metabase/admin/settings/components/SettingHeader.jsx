import React from "react";

const SettingHeader = ({ setting }) => (
  <div>
    <div className="text-grey-4 text-bold text-uppercase">
      {setting.display_name}
    </div>
    <div className="text-grey-4 text-measure my1">
      {setting.description}
      {setting.note && <div>{setting.note}</div>}
    </div>
  </div>
);

export default SettingHeader;
