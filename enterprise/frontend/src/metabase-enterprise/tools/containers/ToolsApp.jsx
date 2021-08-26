import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";

import AdminLayout from "metabase/components/AdminLayout";

export default class ToolsApp extends Component {
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
              name={t`Erroring Questions`}
              path="/admin/tools/errors"
            />
          </LeftNavPane>
        }
      >
        {children}
      </AdminLayout>
    );
  }
}
