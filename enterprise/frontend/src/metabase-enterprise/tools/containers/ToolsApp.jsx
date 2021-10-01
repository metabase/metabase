import React, { Component } from "react";
import PropTypes from "prop-types";

import AdminLayout from "metabase/components/AdminLayout";

export default class ToolsApp extends Component {
  static propTypes = {
    children: PropTypes.node,
  };

  render() {
    const { children } = this.props;
    return <AdminLayout><h2>Questions that errored when last run</h2>{children}</AdminLayout>;
  }
}
