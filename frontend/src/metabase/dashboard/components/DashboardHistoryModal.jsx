/* eslint-disable react/prop-types */
import React from "react";
import { withRouter } from "react-router";

import HistoryModal from "metabase/containers/HistoryModal";
import * as Urls from "metabase/lib/urls";
import * as dashboardActions from "metabase/dashboard/actions";
import Dashboards from "metabase/entities/dashboards";
import connect from "react-redux/lib/connect/connect";

@withRouter
@Dashboards.load({
  id: (state, props) => Urls.extractEntityId(props.params.slug),
  wrapped: false,
})
@connect(
  null,
  dashboardActions,
)
export default class DashboardHistoryModal extends React.Component {
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
