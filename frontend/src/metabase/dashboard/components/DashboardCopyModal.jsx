/* eslint-disable react/prop-types */
import React from "react";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { dissoc } from "icepick";
import _ from "underscore";

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

class DashboardCopyModalInner extends React.Component {
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
    console.log("🚀", { props });
    return (
      <EntityCopyModal
        entityType="dashboards"
        entityObject={{
          ...dashboard,
          collection_id: initialCollectionId,
        }}
        form={Dashboards.forms.duplicate}
        overwriteOnInitialValuesChange
        copy={object => {
          console.log("🚀", "copied");
          /* eslint-disable */
          return;
          copyDashboard({ id: initialDashboardId }, dissoc(object, "id"));
        }}
        onClose={onClose}
        onSaved={dashboard => {
          console.log("🚀", "pretend it's saved");
          return;
          onReplaceLocation(Urls.dashboard(dashboard));
        }}
        {...props}
      />
    );
  }
}

const DashboardCopyModal = _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(DashboardCopyModalInner);

export default DashboardCopyModal;
