import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";

import AdminLayout from "metabase/components/AdminLayout";

export default class ToolsApp extends Component {
  static propTypes = {
    children: PropTypes.node,
  };

  render() {
    const { children } = this.props;
    return (
      <AdminLayout>
        {children}
      </AdminLayout>
    );
  }
}
