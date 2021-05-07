/* eslint-disable react/prop-types */
import React from "react";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { dissoc } from "icepick";

import { replace } from "react-router-redux";
import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";
import Collections from "metabase/entities/collections";

import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";

import { getDashboardComplete } from "../selectors";

const mapStateToProps = (state, props) => {
  const dashboard = getDashboardComplete(state, props);
  return {
    dashboard,
    initialCollectionId: Collections.selectors.getInitialCollectionId(state, {
      ...props,
      collectionId: dashboard && dashboard.collection_id,
    }),
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
      initialCollectionId,
      params,
      ...props
    } = this.props;
    const initialDashboardId = Urls.extractEntityId(params.slug);
    return (
      <EntityCopyModal
        entityType="dashboards"
        entityObject={{
          ...dashboard,
          collection_id: initialCollectionId,
        }}
        overwriteOnInitialValuesChange
        copy={object =>
          copyDashboard({ id: initialDashboardId }, dissoc(object, "id"))
        }
        onClose={onClose}
        onSaved={dashboard => onReplaceLocation(Urls.dashboard(dashboard))}
        {...props}
      />
    );
  }
}

export default DashboardCopyModal;
