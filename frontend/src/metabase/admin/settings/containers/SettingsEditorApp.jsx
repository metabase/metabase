import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import { connect } from "react-redux";
import MetabaseAnalytics from "metabase/lib/analytics";

import AdminLayout from "metabase/components/AdminLayout.jsx";

import SettingsSetting from "../components/SettingsSetting.jsx";
import SettingsEmailForm from "../components/SettingsEmailForm.jsx";
import SettingsSlackForm from "../components/SettingsSlackForm.jsx";
import SettingsSetupList from "../components/SettingsSetupList.jsx";
import SettingsUpdatesForm from "../components/SettingsUpdatesForm.jsx";
import SettingsSingleSignOnForm from "../components/SettingsSingleSignOnForm.jsx";
import SettingsCustomMaps from "../components/SettingsCustomMaps.jsx";

import _ from "underscore";
import cx from 'classnames';


import {
    getSettings,
    getSections,
    getActiveSection,
    getNewVersionAvailable
} from "../selectors";
import * as settingsActions from "../settings";

const mapStateToProps = (state, props) => {
    return {
        settings:            getSettings(state, props),
        sections:            getSections(state, props),
        activeSection:       getActiveSection(state, props),
        newVersionAvailable: getNewVersionAvailable(state, props)
    }
}

const mapDispatchToProps = {
    ...settingsActions
}

@connect(mapStateToProps, mapDispatchToProps)
export default class SettingsEditorApp extends Component {
    constructor(props, context) {
        super(props, context);
        this.handleChangeEvent = this.handleChangeEvent.bind(this);
        this.updateSetting = this.updateSetting.bind(this);
    }

    static propTypes = {
        sections: PropTypes.array.isRequired,
        activeSection: PropTypes.object.isRequired,
        updateSetting: PropTypes.func.isRequired,
        updateEmailSettings: PropTypes.func.isRequired,
        updateSlackSettings: PropTypes.func.isRequired,
        sendTestEmail: PropTypes.func.isRequired
    };

    componentWillMount() {
        this.props.initializeSettings();
    }

    updateSetting(setting, value) {
        this.refs.layout.setSaving();
        setting.value = value;
        this.props.updateSetting(setting).then(() => {
            this.refs.layout.setSaved();

            let val = (setting.key === "report-timezone" || setting.key === "anon-tracking-enabled") ? setting.value : "success";
            MetabaseAnalytics.trackEvent("General Settings", setting.display_name, val);
        }, (error) => {
            this.refs.layout.setSaveError(error.data);
            MetabaseAnalytics.trackEvent("General Settings", setting.display_name, "error");
        });
    }

    handleChangeEvent(setting, event) {
        this.updateSetting(setting, event.target.value);
    }

    renderSettingsPane() {
        if (!this.props.activeSection) return null;

        let section = this.props.activeSection; // this.props.sections[this.state.currentSection];

        if (section.name === "Email") {
            return (
                <SettingsEmailForm
                    ref="emailForm"
                    elements={section.settings}
                    updateEmailSettings={this.props.updateEmailSettings}
                    sendTestEmail={this.props.sendTestEmail}
                />
            );
        } else if (section.name === "Setup") {
            return (
                <SettingsSetupList
                    ref="settingsForm"
                />
            );
        } else if (section.name === "Slack") {
            return (
                <SettingsSlackForm
                    ref="slackForm"
                    elements={section.settings}
                    updateSlackSettings={this.props.updateSlackSettings}
                />
            );
        } else if (section.name === "Updates") {
            return (
                <SettingsUpdatesForm
                    settings={this.props.settings}
                    elements={section.settings}
                    updateSetting={this.updateSetting}
                    handleChangeEvent={this.handleChangeEvent}
                />
            );
        } else if (section.name === "Single Sign-On") {
            return (
                <SettingsSingleSignOnForm
                    elements={section.settings}
                    updateSetting={this.updateSetting}
                />
            );
        } else if (section.name === "Custom Maps") {
            return (
                <SettingsCustomMaps
                    elements={section.settings}
                    reloadSettings={this.props.reloadSettings}
                />
            );
        } else {
            let settings = section.settings.map((setting, index) => {
                return <SettingsSetting key={setting.key} setting={setting} updateSetting={this.updateSetting} handleChangeEvent={this.handleChangeEvent} autoFocus={index === 0}/>
            });

            return (
                <ul>{settings}</ul>
            );
        }
    }

    renderSettingsSections() {
        const { sections, activeSection, newVersionAvailable } = this.props;

        const renderedSections = _.map(sections, (section, idx) => {
            const classes = cx("AdminList-item", "flex", "align-center", "justify-between", "no-decoration", {
                "selected": activeSection && section.name === activeSection.name // this.state.currentSection === idx
            });

            // if this is the Updates section && there is a new version then lets add a little indicator
            let newVersionIndicator;
            if (section.name === "Updates" && newVersionAvailable) {
                newVersionIndicator = (
                    <span style={{padding: "4px 8px 4px 8px"}} className="bg-brand rounded text-white text-bold h6">1</span>
                );
            }

            return (
                <li key={section.name}>
                    <Link to={"/admin/settings/" + section.slug}  className={classes}>
                        <span>{section.name}</span>
                        {newVersionIndicator}
                    </Link>
                </li>
            );
        });

        return (
            <div className="MetadataEditor-table-list AdminList flex-no-shrink">
                <ul className="AdminList-items pt1">
                    {renderedSections}
                </ul>
            </div>
        );
    }

    render() {
        return (
            <AdminLayout
                ref="layout"
                title="Settings"
                sidebar={this.renderSettingsSections()}
            >
                {this.renderSettingsPane()}
            </AdminLayout>
        )
    }
}
