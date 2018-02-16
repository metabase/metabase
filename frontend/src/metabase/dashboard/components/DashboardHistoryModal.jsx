import React from "react";
import HistoryModal from "metabase/components/HistoryModal";
import { withRouter } from "react-router";
import { Component } from "react/lib/ReactBaseClasses";
import * as dashboardActions from "../dashboard";
import { connect } from "react-redux";
import { getRevisions } from "metabase/dashboard/selectors";
import type { EntityType, EntityId } from "metabase/meta/types";
import type { RevisionId } from "metabase/meta/types/Revision";

const mapStateToProps = (state, props) => {
  return { revisions: getRevisions(state, props) };
};

const mapDispatchToProps = {
  ...dashboardActions,
};

@connect(mapStateToProps, mapDispatchToProps)
@withRouter
export class DashboardHistoryModal extends Component {
  props: {
    location: Object,
    onClose: () => any,
    revisions: { [key: string]: Revision[] },
    fetchRevisions: ({ entity: string, id: number }) => void,
    revertToRevision: ({
      entity: string,
      id: number,
      revision_id: RevisionId,
    }) => void,
  };

  // 1. fetch revisions
  onFetchRevisions = ({ entity, id }: { entity: EntityType, id: EntityId }) => {
    return this.props.fetchRevisions({ entity, id });
  };

  // 2. revert to a revision
  onRevertToRevision = ({
    entity,
    id,
    revision_id,
  }: {
    entity: EntityType,
    id: EntityId,
    revision_id: RevisionId,
  }) => {
    return this.props.revertToRevision({ entity, id, revision_id });
  };

  // 3. finished reverting to a revision
  onRevertedRevision = () => {
    const { fetchDashboard, params, location, onClose } = this.props;
    fetchDashboard(parseInt(params.dashboardId), location.query);
    onClose();
  };

  render() {
    const { params, onClose } = this.props;

    // NOTE Atte Keinänen 1/17/18: While we still use react-router v3,
    // we have to read the dashboard id from parsed route via `params`.
    // Migrating to react-router v4 will make this easier because can
    // have the route definition and the component in `<DashboardHeader>`
    // which already knows the dashboard id
    return (
      <HistoryModal
        entityType="dashboard"
        entityId={parseInt(params.dashboardId)}
        revisions={this.props.revisions["dashboard-" + params.dashboardId]}
        onFetchRevisions={this.onFetchRevisions}
        onRevertToRevision={this.onRevertToRevision}
        onReverted={this.onRevertedRevision}
        onClose={onClose}
      />
    );
  }
}
