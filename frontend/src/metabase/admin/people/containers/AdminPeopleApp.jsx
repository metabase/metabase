/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";

import {
  LeftNavPane,
  LeftNavPaneItem,
} from "metabase/components/LeftNavPane.jsx";

import AdminLayout from "metabase/components/AdminLayout.jsx";

export default class AdminPeopleApp extends Component {
  static propTypes = {
    children: PropTypes.any,
  };

  render() {
    const { children } = this.props;
    return (
      <AdminLayout
        sidebar={
          <LeftNavPane>
            <LeftNavPaneItem name={t`People`} path="/admin/people" index />
            <LeftNavPaneItem name={t`Groups`} path="/admin/people/groups" />
          </LeftNavPane>
        }
      >
        {children}
      </AdminLayout>
    );
  }
}
