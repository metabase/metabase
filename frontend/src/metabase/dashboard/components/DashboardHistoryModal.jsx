import React from "react";
import HistoryModal from "metabase/components/HistoryModal";
import { withRouter } from "react-router";

@withRouter
export class DashboardHistoryModal extends React.Component {
  props: {
    location: Object,
    onClose: () => any,
  };

  // 3. finished reverting to a revision
  onRevertedRevision = () => {
    const { fetchDashboard, params, location, onClose } = this.props;
    fetchDashboard(parseInt(params.dashboardId), location.query);
    onClose();
  };

  render() {
    const { params, onClose } = this.props;

    return (
      <HistoryModal
        entityType="dashboard"
        entityId={params.dashboardId}
        onReverted={this.onRevertedRevision}
        onClose={onClose}
      />
    );
  }
}
