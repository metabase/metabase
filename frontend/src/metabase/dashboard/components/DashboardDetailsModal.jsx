import React from "react";
import { withRouter } from "react-router";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";
import { t } from "ttag";

import Dashboard from "metabase/entities/dashboards";

import { getDashboardComplete } from "../selectors";

const mapStateToProps = (state, props) => {
  return {
    dashboard: getDashboardComplete(state, props),
  };
};

@withRouter
@connect(mapStateToProps)
class DashboardDetailsModal extends React.Component {
  render() {
    const { onClose, onChangeLocation, dashboard, ...props } = this.props;
    return (
      <Dashboard.ModalForm
        title={t`Change title and description`}
        dashboard={dashboard}
        onClose={onClose}
        onSaved={dashboard => onChangeLocation(Urls.dashboard(dashboard.id))}
        {...props}
      />
    );
  }
}

export default DashboardDetailsModal;
