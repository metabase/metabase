/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";

import HistoryModal from "metabase/containers/HistoryModal";
import * as Urls from "metabase/lib/urls";
import {
  fetchDashboard,
  fetchDashboardCardData,
} from "metabase/dashboard/actions";
import Dashboards from "metabase/entities/dashboards";

class DashboardHistoryModal extends React.Component {
  render() {
    const {
      dashboard,
      fetchDashboard,
      fetchDashboardCardData,
      onClose,
      location,
    } = this.props;
    return (
      <HistoryModal
        modelType="dashboard"
        modelId={dashboard.id}
        canRevert={dashboard.can_write}
        onReverted={async () => {
          onClose();
          await fetchDashboard(dashboard.id, location.query);
          await fetchDashboardCardData({ reload: false, clear: true });
        }}
        onClose={onClose}
      />
    );
  }
}

export default _.compose(
  withRouter,
  Dashboards.load({
    id: (state, props) => Urls.extractEntityId(props.params.slug),
    wrapped: false,
  }),
  connect(null, { fetchDashboard, fetchDashboardCardData }),
)(DashboardHistoryModal);
