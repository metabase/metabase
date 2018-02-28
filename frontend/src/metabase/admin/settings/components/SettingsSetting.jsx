import React, { Component } from "react";
import PropTypes from "prop-types";
import { assocIn } from "icepick";

import SettingHeader from "./SettingHeader.jsx";
import { t } from "c-3po";
import SettingInput from "./widgets/SettingInput.jsx";
import SettingNumber from "./widgets/SettingNumber.jsx";
import SettingPassword from "./widgets/SettingPassword.jsx";
import SettingRadio from "./widgets/SettingRadio.jsx";
import SettingToggle from "./widgets/SettingToggle.jsx";
import SettingSelect from "./widgets/SettingSelect.jsx";

const SETTING_WIDGET_MAP = {
  string: SettingInput,
  number: SettingNumber,
  password: SettingPassword,
  select: SettingSelect,
  radio: SettingRadio,
  boolean: SettingToggle,
};

const updatePlaceholderForEnvironmentVars = props => {
  if (props && props.setting && props.setting.is_env_setting) {
    return assocIn(
      props,
      ["setting", "placeholder"],
      t`Using ` + props.setting.env_name,
    );
  }
  return props;
};

export default class SettingsSetting extends Component {
  static propTypes = {
    setting: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
    onChangeSetting: PropTypes.func,
    autoFocus: PropTypes.bool,
    disabled: PropTypes.bool,
  };

  render() {
    const { setting, errorMessage } = this.props;
    let Widget = setting.widget || SETTING_WIDGET_MAP[setting.type];
    if (!Widget) {
      console.warn(
        "No render method for setting type " +
          setting.type +
          ", defaulting to string input.",
      );
      Widget = SettingInput;
    }
    return (
      <li className="m2 mb4">
        {!setting.noHeader && <SettingHeader setting={setting} />}
        <div className="flex">
          <Widget {...updatePlaceholderForEnvironmentVars(this.props)} />
        </div>
        {errorMessage && (
          <div className="text-error text-bold pt1">{errorMessage}</div>
        )}
        {setting.warning && (
          <div className="text-gold text-bold pt1">{setting.warning}</div>
        )}
      </li>
    );
  }
}
