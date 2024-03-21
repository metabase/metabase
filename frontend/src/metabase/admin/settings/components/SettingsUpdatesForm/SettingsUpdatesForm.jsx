import cx from "classnames";
import PropTypes from "prop-types";

import CS from "metabase/css/core/index.css";
import MetabaseSettings from "metabase/lib/settings";

import { SettingsSetting } from "../SettingsSetting";

import VersionUpdateNotice from "./VersionUpdateNotice/VersionUpdateNotice";

export default function SettingsUpdatesForm({ elements, updateSetting }) {
  const settings = elements.map((setting, index) => (
    <SettingsSetting
      key={setting.key}
      setting={setting}
      onChange={value => updateSetting(setting, value)}
      autoFocus={index === 0}
    />
  ));

  return (
    <div style={{ width: "585px" }}>
      {!MetabaseSettings.isHosted() && <ul>{settings}</ul>}

      <div className="px2">
        <div
          className={cx(CS.pt3, {
            [CS.borderTop]: !MetabaseSettings.isHosted(),
          })}
        >
          <VersionUpdateNotice />
        </div>
      </div>
    </div>
  );
}

SettingsUpdatesForm.propTypes = {
  elements: PropTypes.array,
  updateSetting: PropTypes.func,
};
