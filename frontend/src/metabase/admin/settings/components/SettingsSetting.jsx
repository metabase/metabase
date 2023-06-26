/* eslint-disable react/prop-types */
import { Component } from "react";
import PropTypes from "prop-types";
import { jt } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/core/components/ExternalLink";
import SettingHeader from "./SettingHeader";
import SettingInput from "./widgets/SettingInput";
import SettingNumber from "./widgets/SettingNumber";
import SettingPassword from "./widgets/SettingPassword";
import SettingRadio from "./widgets/SettingRadio";
import SettingToggle from "./widgets/SettingToggle";
import SettingSelect from "./widgets/SettingSelect";
import SettingText from "./widgets/SettingText";
import { settingToFormFieldId } from "./../../settings/utils";
import {
  SettingContent,
  SettingEnvVarMessage,
  SettingErrorMessage,
  SettingRoot,
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
    settingValues: PropTypes.object,
    onChange: PropTypes.func.isRequired,
    onChangeSetting: PropTypes.func,
    autoFocus: PropTypes.bool,
    disabled: PropTypes.bool,
  };

  render() {
    const { setting, settingValues, errorMessage } = this.props;
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
      ...setting.getProps?.(setting, settingValues),
      ...setting.props,
      ...this.props,
    };

    return (
      // TODO - this formatting needs to be moved outside this component
      <SettingRoot data-testid={`${setting.key}-setting`}>
        {!setting.noHeader && (
          <SettingHeader id={settingId} setting={setting} />
        )}
        <SettingContent>
          {setting.is_env_setting ? (
            <SettingEnvVarMessage>
              {jt`This has been set by the ${(
                <ExternalLink href={getEnvVarDocsUrl(setting.env_name)}>
                  {setting.env_name}
                </ExternalLink>
              )} environment variable.`}
            </SettingEnvVarMessage>
          ) : (
            <Widget id={settingId} {...widgetProps} />
          )}
        </SettingContent>
        {errorMessage && (
          <SettingErrorMessage>{errorMessage}</SettingErrorMessage>
        )}
        {setting.warning && (
          <SettingWarningMessage>{setting.warning}</SettingWarningMessage>
        )}
      </SettingRoot>
    );
  }
}

const getEnvVarDocsUrl = envName => {
  return MetabaseSettings.docsUrl(
    "configuring-metabase/environment-variables",
    envName?.toLowerCase(),
  );
};
