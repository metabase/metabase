/* @flow */

import React from "react";

import HistoryModal from "metabase/containers/HistoryModal";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { fetchDashboard } from "metabase/dashboard/dashboard";

@withRouter
@connect(
  null,
  { fetchDashboard },
)
export default class DashboardHistoryModal extends React.Component {
  render() {
    const { fetchDashboard, onClose, location, params } = this.props;
    const dashboardId = parseInt(params.dashboardId);
    return (
      <HistoryModal
        modelType="dashboard"
        modelId={dashboardId}
        onReverted={() => {
          fetchDashboard(dashboardId, location.query);
          onClose();
        }}
        onClose={onClose}
      />
    );
  }
}
