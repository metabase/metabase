/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import { AdminLayout } from "metabase/components/AdminLayout";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import { PLUGIN_ADMIN_TROUBLESHOOTING } from "metabase/plugins";

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
            {PLUGIN_ADMIN_TROUBLESHOOTING.GET_EXTRA_NAV()}
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
