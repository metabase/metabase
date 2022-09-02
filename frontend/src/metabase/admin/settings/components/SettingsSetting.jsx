/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";

import SettingHeader from "./SettingHeader";
import { t } from "ttag";

import SettingInput from "./widgets/SettingInput";
import SettingNumber from "./widgets/SettingNumber";
import SettingPassword from "./widgets/SettingPassword";
import SettingRadio from "./widgets/SettingRadio";
import SettingToggle from "./widgets/SettingToggle";
import SettingSelect from "./widgets/SettingSelect";
import SettingText from "./widgets/SettingText";
import { settingToFormFieldId } from "./../../settings/utils";
import {
  SettingPlaceholderMessage,
  SettingErrorMessage,
  SettingWarningMessage,
} from "./SettingsSetting.styled";

const SETTING_WIDGET_MAP = {
  string: SettingInput,
  number: SettingNumber,
  password: SettingPassword,
  select: SettingSelect,
  radio: SettingRadio,
  boolean: SettingToggle,
  text: SettingText,
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
    const settingId = settingToFormFieldId(setting);

    let Widget = setting.widget || SETTING_WIDGET_MAP[setting.type];
    if (!Widget) {
      console.warn(
        "No render method for setting type " +
          setting.type +
          ", defaulting to string input.",
      );
      Widget = SettingInput;
    }

    const widgetProps = {
      setting,
      ...setting.getProps?.(setting),
      ...setting.props,
    };

    return (
      // TODO - this formatting needs to be moved outside this component
      <li className="m2 mb4">
        {!setting.noHeader && (
          <SettingHeader id={settingId} setting={setting} />
        )}
        <div className="flex">
          {setting.is_env_setting ? (
            <SettingPlaceholderMessage>
              {t`Using ` + setting.env_name}
            </SettingPlaceholderMessage>
          ) : (
            <Widget id={settingId} {...widgetProps} />
          )}
        </div>
        {errorMessage && (
          <SettingErrorMessage>{errorMessage}</SettingErrorMessage>
        )}
        {setting.warning && (
          <SettingWarningMessage>{setting.warning}</SettingWarningMessage>
        )}
      </li>
    );
  }
}
