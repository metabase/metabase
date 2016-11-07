import React, { Component, PropTypes } from "react";

import Input from "metabase/components/Input.jsx";
import Select from "metabase/components/Select.jsx";
import Toggle from "metabase/components/Toggle.jsx";
import Radio from "metabase/components/Radio.jsx";

export default class SettingsSetting extends Component {
    static propTypes = {
        setting: PropTypes.object.isRequired,
        updateSetting: PropTypes.func.isRequired,
        handleChangeEvent: PropTypes.func.isRequired,
        autoFocus: PropTypes.bool,
        disabled: PropTypes.bool,
    };

    renderStringInput(setting, type="text") {
        var className = type === "password" ? "SettingsPassword" : "SettingsInput";
        return (
            <Input
                className={className + " AdminInput bordered rounded h3"}
                type={type}
                value={setting.value}
                placeholder={setting.placeholder}
                onBlurChange={this.props.handleChangeEvent.bind(null, setting)}
                autoFocus={this.props.autoFocus}
            />
        );
    }

    renderRadioInput(setting) {
        return (
            <Radio
                value={setting.value}
                onChange={(value) => this.props.updateSetting(setting, value)}
                options={setting.options}
            />
        );
    }

    renderSelectInput(setting) {
        return (
            <Select
                className="full-width"
                placeholder={setting.placeholder}
                value={setting.value}
                options={setting.options}
                onChange={this.props.updateSetting.bind(null, setting)}
                optionNameFn={option => typeof option === "object" ? option.name : option }
                optionValueFn={option => typeof option === "object" ? option.value : option }
            />
        );
    }

    renderToggleInput(setting) {
        const value = setting.value == null ? setting.default : setting.value,
              on    = value === true || value === "true";
        return (
            <div className="flex align-center pt1">
                <Toggle value={on} onChange={!this.props.disabled ? this.props.updateSetting.bind(null, setting, on ? "false" : "true") : null}/>
                <span className="text-bold mx1">{on ? "Enabled" : "Disabled"}</span>
            </div>
        );
    }

    render() {
        var setting = this.props.setting;
        var control;
        switch (setting.type) {
            case "string":   control = this.renderStringInput(setting); break;
            case "password": control = this.renderStringInput(setting, "password"); break;
            case "select":   control = this.renderSelectInput(setting); break;
            case "radio":    control = this.renderRadioInput(setting); break;
            case "boolean":  control = this.renderToggleInput(setting); break;
            default:
                console.warn("No render method for setting type " + setting.type + ", defaulting to string input.");
                control = this.renderStringInput(setting);
        }
        return (
            <li className="m2 mb4">
                <div className="text-grey-4 text-bold text-uppercase">{setting.display_name}</div>
                <div className="text-grey-4 my1">
                    {setting.description}
                    {setting.note && <div>{setting.note}</div>}
                </div>
                <div className="flex">{control}</div>
            </li>
        );
    }
}
