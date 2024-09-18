import { Fragment } from "react";

import { SettingDescription, SettingTitle } from "./SettingHeader.styled";

interface SettingHeaderProps {
  id: string;
  setting: {
    display_name?: string;
    warningMessage?: string;
    description?: string | string[];
    note?: string;
  };
}

const SettingHeader = ({ id, setting }: SettingHeaderProps) => (
  <div>
    <SettingTitle htmlFor={id}>{setting.display_name}</SettingTitle>
    <SettingDescription>
      {setting.warningMessage && (
        <Fragment>
          <strong>{setting.warningMessage}</strong>{" "}
        </Fragment>
      )}
      {setting.description}
      {setting.note && <div>{setting.note}</div>}
    </SettingDescription>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SettingHeader;
