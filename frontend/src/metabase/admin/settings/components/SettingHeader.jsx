/* eslint-disable react/prop-types */
import React from "react";

const SettingHeader = ({ id, setting }) => (
  <div>
    <label className="text-medium text-bold text-uppercase" htmlFor={id}>
      {setting.display_name}
    </label>
    <div className="text-medium text-measure my1">
      {setting.warningMessage && (
        <React.Fragment>
          <strong>{setting.warningMessage}</strong>{" "}
        </React.Fragment>
      )}
      {setting.description}
      {setting.note && <div>{setting.note}</div>}
    </div>
  </div>
);

export default SettingHeader;
