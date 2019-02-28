/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";

import {
  LeftNavPane,
  LeftNavPaneItem,
} from "metabase/components/LeftNavPane.jsx";

import AdminLayout from "metabase/components/AdminLayout.jsx";

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
