/* eslint-disable react/prop-types */
import { bindActionCreators } from "@reduxjs/toolkit";
import cx from "classnames";
import PropTypes from "prop-types";
import { Component, createRef } from "react";
import { connect } from "react-redux";
import { Link } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { prepareAnalyticsValue } from "metabase/admin/settings/utils";
import { UpsellSSO } from "metabase/admin/upsells";
import { AdminLayout } from "metabase/components/AdminLayout";
import { NotFound } from "metabase/components/ErrorPages";
import SaveStatus from "metabase/components/SaveStatus";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import title from "metabase/hoc/Title";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import { Box } from "metabase/ui";

import {
  getActiveSection,
  getActiveSectionName,
  getDerivedSettingValues,
  getNewVersionAvailable,
  getSections,
  getSettings,
  getSettingValues,
} from "../../../selectors";
import {
  initializeSettings,
  reloadSettings,
  updateSetting,
} from "../../../settings";

import { NewVersionIndicator } from "./SettingsEditor.styled";
import { SettingsSection } from "./SettingsSection";

const mapStateToProps = (state, props) => {
  return {
    settings: getSettings(state, props),
    settingValues: getSettingValues(state, props),
    derivedSettingValues: getDerivedSettingValues(state, props),
    sections: getSections(state, props),
    activeSection: getActiveSection(state, props),
    activeSectionName: getActiveSectionName(state, props),
    newVersionAvailable: getNewVersionAvailable(state, props),
  };
};

const mapDispatchToProps = dispatch => ({
  ...bindActionCreators(
    {
      initializeSettings,
      updateSetting,
      reloadSettings,
    },
    dispatch,
  ),
  dispatch,
});

class SettingsEditor extends Component {
  layout = null; // the reference to AdminLayout

  static propTypes = {
    sections: PropTypes.object.isRequired,
    activeSection: PropTypes.object,
    activeSectionName: PropTypes.string,
    updateSetting: PropTypes.func.isRequired,
  };

  constructor(props) {
    super(props);
    this.saveStatusRef = createRef();
  }

  componentDidMount() {
    this.props.initializeSettings();
  }

  /**
   * @param {Object} setting
   * @param {*} newValue
   * @param {Object} options - allows external callers in setting's that user custom components to hook into the success or failure of the update
   * @param {function} [options.onChanged] - callback fired after the setting has been updated
   * @param {function} [options.onError] - callback fired after the setting has failed to update
   */
  updateSetting = async (setting, newValue, options) => {
    const { settingValues, updateSetting, reloadSettings, dispatch } =
      this.props;

    this.saveStatusRef.current.setSaving();

    const oldValue = setting.value;

    // TODO: mutation bad!
    setting.value = newValue;

    const handlerParams = [
      oldValue,
      newValue,
      settingValues,
      this.handleChangeSetting,
    ];

    try {
      if (setting.onBeforeChanged) {
        await setting.onBeforeChanged(...handlerParams);
      }

      if (!setting.disableDefaultUpdate) {
        await updateSetting(setting);
      }

      if (setting.onChanged) {
        await setting.onChanged(...handlerParams);
      }

      if (options?.onChanged) {
        await options.onChanged(...handlerParams);
      }

      if (setting.disableDefaultUpdate) {
        await reloadSettings();
      }

      if (setting.postUpdateActions) {
        for (const action of setting.postUpdateActions) {
          await dispatch(action());
        }
      }

      if (setting.key === "application-colors") {
        this.saveStatusRef.current.setSaved(
          t`Changes saved. Please refresh the page to see them`,
        );
      } else {
        this.saveStatusRef.current.setSaved();
      }

      const value = prepareAnalyticsValue(setting);

      MetabaseAnalytics.trackStructEvent(
        "General Settings",
        setting.display_name || setting.key,
        value,
        // pass the actual value if it's a number
        typeof value === "number" && value,
      );
    } catch (error) {
      console.error(error);
      const message =
        error && (error.message || (error.data && error.data.message));
      this.saveStatusRef.current.setSaveError(message);
      if (options?.onError) {
        options.onError(error, message);
      }
      MetabaseAnalytics.trackStructEvent(
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
      console.error(`Attempted to change unknown setting ${key}`);
      throw new Error(t`Unknown setting ${key}`);
    }
    return updateSetting({ ...setting, value });
  };

  renderSettingsPane() {
    const { activeSection, settings, settingValues, derivedSettingValues } =
      this.props;
    const isLoading = settings.length === 0;

    if (isLoading) {
      return null;
    }

    if (!activeSection) {
      return <NotFound />;
    }

    if (activeSection.component) {
      return (
        <activeSection.component
          saveStatusRef={this.saveStatusRef}
          elements={activeSection.settings}
          settingValues={settingValues}
          derivedSettingValues={derivedSettingValues}
          updateSetting={this.updateSetting.bind(this)}
          onChangeSetting={this.handleChangeSetting.bind(this)}
          reloadSettings={this.props.reloadSettings}
        />
      );
    }
    return (
      <SettingsSection
        tabs={activeSection.tabs}
        settingElements={activeSection.settings}
        settingValues={settingValues}
        derivedSettingValues={derivedSettingValues}
        updateSetting={this.updateSetting.bind(this)}
        onChangeSetting={this.handleChangeSetting.bind(this)}
        reloadSettings={this.props.reloadSettings}
      />
    );
  }

  renderSettingsSections() {
    const { sections, activeSectionName, newVersionAvailable } = this.props;

    const renderedSections = Object.entries(sections).map(
      ([slug, section], idx) => {
        // HACK - This is used to hide specific items in the sidebar and is currently
        // only used as a way to fake the multi page auth settings pages without
        // requiring a larger refactor.
        const isNestedSettingPage = Boolean(slug.split("/")[1]);
        if (isNestedSettingPage) {
          return null;
        }

        // The nested authentication routes should be matched just on the prefix:
        // e.g. "authentication/google" => "authentication"
        const [sectionNamePrefix] = activeSectionName.split("/");

        const classes = cx(
          AdminS.AdminListItem,
          CS.flex,
          CS.alignCenter,
          CS.noDecoration,
          CS.justifyBetween,
          { [AdminS.selected]: slug === sectionNamePrefix },
        );

        // if this is the Updates section && there is a new version then lets add a little indicator
        const shouldDisplayNewVersionIndicator =
          slug === "updates" &&
          newVersionAvailable &&
          !MetabaseSettings.isHosted();

        const newVersionIndicator = shouldDisplayNewVersionIndicator ? (
          <NewVersionIndicator>1</NewVersionIndicator>
        ) : null;

        return (
          <li key={slug}>
            <Link
              data-testid="settings-sidebar-link"
              to={"/admin/settings/" + slug}
              className={classes}
            >
              <span>{section.name}</span>
              {newVersionIndicator}
            </Link>
          </li>
        );
      },
    );

    return (
      <aside className={cx(AdminS.AdminList, CS.flexNoShrink)}>
        <ul className={CS.pt1} data-testid="admin-list-settings-items">
          <ErrorBoundary>{renderedSections}</ErrorBoundary>
        </ul>
      </aside>
    );
  }

  renderUpsell() {
    const upsell =
      this.props.activeSectionName === "authentication" ? (
        <UpsellSSO source="authentication-sidebar" />
      ) : null;

    if (!upsell) {
      return null;
    }

    return <Box style={{ flexShrink: 0 }}>{upsell}</Box>;
  }

  render() {
    return (
      <AdminLayout
        sidebar={this.renderSettingsSections()}
        upsell={this.renderUpsell()}
      >
        <Box w="100%">
          <SaveStatus ref={this.saveStatusRef} />
          <ErrorBoundary>{this.renderSettingsPane()}</ErrorBoundary>
        </Box>
      </AdminLayout>
    );
  }
}

export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  title(({ activeSection }) => activeSection && activeSection.name),
)(SettingsEditor);
