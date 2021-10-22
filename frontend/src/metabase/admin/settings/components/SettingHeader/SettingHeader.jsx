/* eslint-disable react/prop-types */
import React from "react";

import { SettingDescription, SettingTitle } from "./SettingHeader.styled";

const SettingHeader = ({ id, setting }) => (
  <div>
    <SettingTitle htmlFor={id}>{setting.display_name}</SettingTitle>
    <SettingDescription>
      {setting.warningMessage && (
        <React.Fragment>
          <strong>{setting.warningMessage}</strong>{" "}
        </React.Fragment>
      )}
      {setting.description}
      {setting.note && <div>{setting.note}</div>}
    </SettingDescription>
  </div>
);
export default SettingHeader;
