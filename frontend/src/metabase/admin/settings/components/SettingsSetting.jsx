import React, { Component, PropTypes } from "react";

import SettingHeader from "./SettingHeader.jsx";

import SettingInput from "./widgets/SettingInput.jsx";
import SettingPassword from "./widgets/SettingPassword.jsx";
import SettingRadio from "./widgets/SettingRadio.jsx";
import SettingToggle from "./widgets/SettingToggle.jsx";
import SettingSelect from "./widgets/SettingSelect.jsx";

const SETTING_WIDGET_MAP = {
    "string":   SettingInput,
    "password": SettingPassword,
    "select":   SettingSelect,
    "radio":    SettingRadio,
    "boolean":  SettingToggle
};

export default class SettingsSetting extends Component {
    static propTypes = {
        setting: PropTypes.object.isRequired,
        updateSetting: PropTypes.func.isRequired,
        autoFocus: PropTypes.bool,
        disabled: PropTypes.bool,
    };

    render() {
        const { setting, errorMessage } = this.props;
        let Widget = setting.widget || SETTING_WIDGET_MAP[setting.type];
        if (!Widget) {
            console.warn("No render method for setting type " + setting.type + ", defaulting to string input.");
            Widget = SettingInput;
        }
        return (
            <li className="m2 mb4">
                { !setting.noHeader &&
                    <SettingHeader setting={setting} />
                }
                <div className="flex">
                    <Widget {...this.props} />
                </div>
                { errorMessage &&
                    <div className="text-error text-bold pt1">{errorMessage}</div>
                }
            </li>
        );
    }
}
