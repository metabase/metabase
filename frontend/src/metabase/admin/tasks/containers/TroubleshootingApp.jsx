/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";

import AdminLayout from "metabase/components/AdminLayout";

export default class TroubleshootingApp extends Component {
  static propTypes = {
    children: PropTypes.any,
  };

  render() {
    const { children } = this.props;
    return (
      <AdminLayout
        sidebar={
          <LeftNavPane>
            <LeftNavPaneItem
              name={t`Help`}
              path="/admin/troubleshooting/help"
            />
            <LeftNavPaneItem
              name={t`Tasks`}
              path="/admin/troubleshooting/tasks"
              index
            />
            <LeftNavPaneItem
              name={t`Jobs`}
              path="/admin/troubleshooting/jobs"
            />
            <LeftNavPaneItem
              name={t`Logs`}
              path="/admin/troubleshooting/logs"
            />
          </LeftNavPane>
        }
      >
        {children}
      </AdminLayout>
    );
  }
}
