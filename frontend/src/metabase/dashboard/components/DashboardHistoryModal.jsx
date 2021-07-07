/* eslint-disable react/prop-types */
import React from "react";
import { withRouter } from "react-router";

import HistoryModal from "metabase/containers/HistoryModal";
import * as Urls from "metabase/lib/urls";
import Dashboards from "metabase/entities/dashboards";

@withRouter
@Dashboards.load({
  id: (state, props) => Urls.extractEntityId(props.params.slug),
  wrapped: false,
})
export default class DashboardHistoryModal extends React.Component {
  render() {
    const { dashboard, fetch, onClose, location } = this.props;
    return (
      <HistoryModal
        modelType="dashboard"
        modelId={dashboard.id}
        canRevert={dashboard.can_write}
        onReverted={() => {
          fetch(dashboard.id, location.query);
          onClose();
        }}
        onClose={onClose}
      />
    );
  }
}
