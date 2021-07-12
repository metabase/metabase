import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import MetabaseSettings from "metabase/lib/settings";
import SettingsSetting from "../SettingsSetting";

import VersionUpdateNotice from "./VersionUpdateNotice/VersionUpdateNotice";

export default class SettingsUpdatesForm extends Component {
  static propTypes = {
    elements: PropTypes.array,
    updateSetting: PropTypes.func.isRequired,
  };

  render() {
    const { elements, updateSetting } = this.props;

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
            className={cx("pt3", {
              "border-top": !MetabaseSettings.isHosted(),
            })}
          >
            <VersionUpdateNotice />
          </div>
        </div>
      </div>
    );
  }
}
