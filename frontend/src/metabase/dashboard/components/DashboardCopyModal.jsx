import React from "react";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { dissoc } from "icepick";

import { replace } from "react-router-redux";
import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";

import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";

import { getDashboardComplete } from "../selectors";

const mapStateToProps = (state, props) => {
  return {
    dashboard: getDashboardComplete(state, props),
  };
};

const mapDispatchToProps = {
  copyDashboard: Dashboards.actions.copy,
  onReplaceLocation: replace,
};

@withRouter
@connect(
  mapStateToProps,
  mapDispatchToProps,
)
class DashboardCopyModal extends React.Component {
  render() {
    const {
      onClose,
      onReplaceLocation,
      copyDashboard,
      dashboard,
      ...props
    } = this.props;
    return (
      <EntityCopyModal
        entityType="dashboards"
        entityObject={dashboard}
        copy={object =>
          copyDashboard(
            { id: this.props.params.dashboardId },
            dissoc(object, "id"),
          )
        }
        onClose={onClose}
        onSaved={dashboard => onReplaceLocation(Urls.dashboard(dashboard.id))}
        {...props}
      />
    );
  }
}

export default DashboardCopyModal;
