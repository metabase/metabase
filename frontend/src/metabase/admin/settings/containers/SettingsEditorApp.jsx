import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { connect } from "react-redux";
import title from "metabase/hoc/Title";
import MetabaseAnalytics from "metabase/lib/analytics";
import { slugify } from "metabase/lib/formatting";
import { t } from "c-3po";
import AdminLayout from "metabase/components/AdminLayout.jsx";

import SettingsSetting from "../components/SettingsSetting.jsx";
import SettingsEmailForm from "../components/SettingsEmailForm.jsx";
import SettingsSlackForm from "../components/SettingsSlackForm.jsx";
import SettingsLdapForm from "../components/SettingsLdapForm.jsx";
import SettingsSetupList from "../components/SettingsSetupList.jsx";
import SettingsUpdatesForm from "../components/SettingsUpdatesForm.jsx";
import SettingsSingleSignOnForm from "../components/SettingsSingleSignOnForm.jsx";
import SettingsAuthenticationOptions from "../components/SettingsAuthenticationOptions.jsx";

import { prepareAnalyticsValue } from "metabase/admin/settings/utils";

import _ from "underscore";
import cx from "classnames";

import {
  getSettings,
  getSettingValues,
  getSections,
  getActiveSection,
  getNewVersionAvailable,
} from "../selectors";
import * as settingsActions from "../settings";

const mapStateToProps = (state, props) => {
  return {
    settings: getSettings(state, props),
    settingValues: getSettingValues(state, props),
    sections: getSections(state, props),
    activeSection: getActiveSection(state, props),
    newVersionAvailable: getNewVersionAvailable(state, props),
  };
};

const mapDispatchToProps = {
  ...settingsActions,
};

@connect(mapStateToProps, mapDispatchToProps)
@title(({ activeSection }) => activeSection && activeSection.name)
export default class SettingsEditorApp extends Component {
  layout = null; // the reference to AdminLayout

  static propTypes = {
    sections: PropTypes.array.isRequired,
    activeSection: PropTypes.object,
    updateSetting: PropTypes.func.isRequired,
    updateEmailSettings: PropTypes.func.isRequired,
    updateSlackSettings: PropTypes.func.isRequired,
    updateLdapSettings: PropTypes.func.isRequired,
    sendTestEmail: PropTypes.func.isRequired,
    clearEmailSettings: PropTypes.func.isRequired,
  };

  componentWillMount() {
    this.props.initializeSettings();
  }

  updateSetting = async (setting, newValue) => {
    const { settingValues, updateSetting } = this.props;

    this.layout.setSaving();

    const oldValue = setting.value;

    // TODO: mutation bad!
    setting.value = newValue;
    try {
      await updateSetting(setting);

      if (setting.onChanged) {
        await setting.onChanged(
          oldValue,
          newValue,
          settingValues,
          this.handleChangeSetting,
        );
      }

      this.layout.setSaved();

      const value = prepareAnalyticsValue(setting);

      MetabaseAnalytics.trackEvent(
        "General Settings",
        setting.display_name || setting.key,
        value,
        // pass the actual value if it's a number
        typeof value === "number" && value,
      );
    } catch (error) {
      let message =
        error && (error.message || (error.data && error.data.message));
      this.layout.setSaveError(message);
      MetabaseAnalytics.trackEvent(
        "General Settings",
        setting.display_name,
        "error",
      );
    }
  };

  handleChangeSetting = (key, value) => {
    const { settings, updateSetting } = this.props;
    const setting = _.findWhere(settings, { key });
    if (!setting) {
      throw new Error(t`Unknown setting ${key}`);
    }
    return updateSetting({ ...setting, value });
  };

  renderSettingsPane() {
    const { activeSection, settingValues } = this.props;

    if (!activeSection) {
      return null;
    }

    if (activeSection.name === "Email") {
      return (
        <SettingsEmailForm
          ref="emailForm"
          elements={activeSection.settings}
          updateEmailSettings={this.props.updateEmailSettings}
          sendTestEmail={this.props.sendTestEmail}
          clearEmailSettings={this.props.clearEmailSettings}
        />
      );
    } else if (activeSection.name === "Setup") {
      return <SettingsSetupList ref="settingsForm" />;
    } else if (activeSection.name === "Slack") {
      return (
        <SettingsSlackForm
          ref="slackForm"
          elements={activeSection.settings}
          updateSlackSettings={this.props.updateSlackSettings}
        />
      );
    } else if (activeSection.name === "Updates") {
      return (
        <SettingsUpdatesForm
          settings={this.props.settings}
          elements={activeSection.settings}
          updateSetting={this.updateSetting}
        />
      );
    } else if (activeSection.name === "Authentication") {
      // HACK - the presence of this param is a way for us to tell if
      // a user is looking at a sub section of the autentication section
      // since allowing for multi page settings more broadly would require
      // a fairly significant refactor of how settings does its routing logic
      if (this.props.params.authType) {
        if (this.props.params.authType === "ldap") {
          return (
            <SettingsLdapForm
              elements={
                _.findWhere(this.props.sections, { slug: "ldap" }).settings
              }
              updateLdapSettings={this.props.updateLdapSettings}
              settingValues={settingValues}
            />
          );
        } else if (this.props.params.authType === "google") {
          return (
            <SettingsSingleSignOnForm
              elements={
                _.findWhere(this.props.sections, {
                  slug: slugify("Single Sign-On"),
                }).settings
              }
              updateSetting={this.updateSetting}
            />
          );
        }
      } else {
        return <SettingsAuthenticationOptions />;
      }
    } else {
      return (
        <ul>
          {activeSection.settings
            .filter(
              setting =>
                setting.getHidden ? !setting.getHidden(settingValues) : true,
            )
            .map((setting, index) => (
              <SettingsSetting
                key={setting.key}
                setting={setting}
                onChange={this.updateSetting.bind(this, setting)}
                onChangeSetting={this.handleChangeSetting}
                reloadSettings={this.props.reloadSettings}
                autoFocus={index === 0}
                settingValues={settingValues}
              />
            ))}
        </ul>
      );
    }
  }

  renderSettingsSections() {
    const { sections, activeSection, newVersionAvailable } = this.props;

    const renderedSections = _.map(sections, (section, idx) => {
      // HACK - This is used to hide specific items in the sidebar and is currently
      // only used as a way to fake the multi page auth settings pages without
      // requiring a larger refactor.
      if (section.sidebar === false) {
        return false;
      }
      const classes = cx(
        "AdminList-item",
        "flex",
        "align-center",
        "justify-between",
        "no-decoration",
        {
          selected: activeSection && section.name === activeSection.name, // this.state.currentSection === idx
        },
      );

      // if this is the Updates section && there is a new version then lets add a little indicator
      let newVersionIndicator;
      if (section.name === "Updates" && newVersionAvailable) {
        newVersionIndicator = (
          <span
            style={{ padding: "4px 8px 4px 8px" }}
            className="bg-brand rounded text-white text-bold h6"
          >
            1
          </span>
        );
      }

      return (
        <li key={section.name}>
          <Link to={"/admin/settings/" + section.slug} className={classes}>
            <span>{section.name}</span>
            {newVersionIndicator}
          </Link>
        </li>
      );
    });

    return (
      <div className="MetadataEditor-table-list AdminList flex-no-shrink">
        <ul className="AdminList-items pt1">{renderedSections}</ul>
      </div>
    );
  }

  render() {
    return (
      <AdminLayout
        ref={layout => (this.layout = layout)}
        title={t`Settings`}
        sidebar={this.renderSettingsSections()}
      >
        {this.renderSettingsPane()}
      </AdminLayout>
    );
  }
}
