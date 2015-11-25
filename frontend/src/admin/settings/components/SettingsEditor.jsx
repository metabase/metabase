import React, { Component, PropTypes } from "react";

import SettingsHeader from "./SettingsHeader.jsx";
import SettingsSetting from "./SettingsSetting.jsx";
import SettingsEmailForm from "./SettingsEmailForm.jsx";
import SettingsSlackForm from "./SettingsSlackForm.jsx";

import _ from "underscore";
import cx from 'classnames';

export default class SettingsEditor extends Component {
    constructor(props, context) {
        super(props, context);
        this.handleChangeEvent = this.handleChangeEvent.bind(this);
        this.selectSection = this.selectSection.bind(this);
        this.updateSetting = this.updateSetting.bind(this);

        this.state = {
            currentSection: 0
        };
    }

    static propTypes = {
        initialSection: PropTypes.number,
        sections: PropTypes.object.isRequired,
        updateSetting: PropTypes.func.isRequired,
        updateEmailSettings: PropTypes.func.isRequired,
        sendTestEmail: PropTypes.func.isRequired
    };

    componentWillMount() {
        if (this.props.initialSection) {
            this.setState({
                currentSection: this.props.initialSection
            });
        }
    }

    selectSection(section) {
        this.setState({ currentSection: section });
    }

    updateSetting(setting, value) {
        this.refs.header.refs.status.setSaving();
        setting.value = value;
        this.props.updateSetting(setting).then(() => {
            this.refs.header.refs.status.setSaved();
        }, (error) => {
            this.refs.header.refs.status.setSaveError(error.data);
        });
    }

    handleChangeEvent(setting, event) {
        this.updateSetting(setting, event.target.value);
    }

    renderSettingsPane() {
        let section = this.props.sections[this.state.currentSection];

        if (section.name === "Email") {
            return (
                <div className="px2">
                    <SettingsEmailForm
                        ref="emailForm"
                        elements={section.settings}
                        updateEmailSettings={this.props.updateEmailSettings}
                        sendTestEmail={this.props.sendTestEmail}
                    />
                </div>
            );
        } else if (section.name === "Slack") {
            return (
                <div className="px2">
                    <SettingsSlackForm
                        ref="slackForm"
                        elements={section.settings}
                        updateSlackSettings={this.props.updateSlackSettings}
                    />
                </div>
            );
        } else {
            let settings = section.settings.map((setting, index) => {
                return <SettingsSetting key={setting.key} setting={setting} updateSetting={this.updateSetting} handleChangeEvent={this.handleChangeEvent} autoFocus={index === 0}/>
            });

            return (
                <div className="px2">
                    <ul>{settings}</ul>
                </div>
            );
        }
    }

    renderSettingsSections() {
        const sections = _.map(this.props.sections, (section, idx) => {
            const classes = cx("AdminList-item", "flex", "align-center", "no-decoration", {
                "selected": this.state.currentSection === idx
            });

            return (
                <li key={section.name}>
                    <a href="#" className={classes} onClick={this.selectSection.bind(null, idx)}>
                        {section.name}
                    </a>
                </li>
            );
        });

        return (
            <div className="MetadataEditor-table-list AdminList">
                <ul className="AdminList-items pt1">
                    {sections}
                </ul>
            </div>
        );
    }

    render() {
        return (
            <div className="MetadataEditor flex flex-column flex-full p4">
                <SettingsHeader ref="header" />
                <div className="MetadataEditor-main flex flex-row flex-full mt2">
                    {this.renderSettingsSections()}
                    {this.renderSettingsPane()}
                </div>
            </div>
        );
    }
}
