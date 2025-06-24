/* eslint-disable react/prop-types */
import { bindActionCreators } from "@reduxjs/toolkit";
import cx from "classnames";
import PropTypes from "prop-types";
import { Component, createRef } from "react";
import { Link } from "react-router";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import { useGetVersionInfoQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { AdminLayout } from "metabase/components/AdminLayout";
import { NotFound } from "metabase/components/ErrorPages";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import title from "metabase/hoc/Title";
import { connect, useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { newVersionAvailable } from "metabase/lib/utils";
import { Box, Group } from "metabase/ui";

import {
  getActiveSection,
  getActiveSectionName,
  getCurrentVersion,
  getDerivedSettingValues,
  getSections,
  getSettingValues,
  getSettings,
} from "../../../selectors";
import { initializeSettings } from "../../../settings";

import { NewVersionIndicator } from "./SettingsEditor.styled";

const mapStateToProps = (state, props) => {
  return {
    settings: getSettings(state, props),
    settingValues: getSettingValues(state, props),
    derivedSettingValues: getDerivedSettingValues(state, props),
    sections: getSections(state, props),
    activeSection: getActiveSection(state, props),
    activeSectionName: getActiveSectionName(state, props),
  };
};

const mapDispatchToProps = (dispatch) => ({
  ...bindActionCreators(
    {
      initializeSettings,
    },
    dispatch,
  ),
  dispatch,
});

const NewVersionIndicatorWrapper = () => {
  const { data: versionInfo } = useGetVersionInfoQuery();
  const currentVersion = useSelector(getCurrentVersion);
  const updateChannel = useSetting("update-channel") ?? "latest";
  const latestVersion = versionInfo?.[updateChannel]?.version;

  if (newVersionAvailable({ currentVersion, latestVersion })) {
    return <NewVersionIndicator>1</NewVersionIndicator>;
  }
  return null;
};

class SettingsEditor extends Component {
  static propTypes = {
    sections: PropTypes.object.isRequired,
    activeSectionName: PropTypes.string,
  };

  constructor(props) {
    super(props);
    this.saveStatusRef = createRef();
  }

  componentDidMount() {
    this.props.initializeSettings();
  }

  renderSettingsSections() {
    // Settings Nav
    const { sections, activeSectionName } = this.props;

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
          slug === "updates" && !MetabaseSettings.isHosted();

        const newVersionIndicator = shouldDisplayNewVersionIndicator ? (
          <NewVersionIndicatorWrapper />
        ) : null;

        return (
          <li key={slug}>
            <Link
              data-testid="settings-sidebar-link"
              to={"/admin/settings/" + slug}
              className={classes}
            >
              <Group gap="xs">
                <span>{section.name}</span>
                {section?.isUpsell && <UpsellGem />}
              </Group>
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

  render() {
    return (
      <AdminLayout sidebar={this.renderSettingsSections()}>
        <Box w="100%">
          <ErrorBoundary>{this.props.children ?? <NotFound />}</ErrorBoundary>
        </Box>
      </AdminLayout>
    );
  }
}

export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  title(({ activeSection }) => activeSection && activeSection.name),
)(SettingsEditor);
