/* eslint-disable react/prop-types */
import React, { useState } from "react";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { dissoc } from "icepick";
import _ from "underscore";
import { t } from "ttag";

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

const DashboardCopyModalInner = ({
  onClose,
  onReplaceLocation,
  copyDashboard,
  dashboard,
  initialCollectionId,
  params,
  ...props
}) => {
  const [title, setTitle] = useState("");
  const initialDashboardId = Urls.extractEntityId(params.slug);

  const handleValuesChange = ({ is_shallow_copy }) => {
    if (!dashboard) {
      setTitle("");
    } else if (is_shallow_copy) {
      setTitle(t`Duplicate "${dashboard.name}"`);
    } else {
      setTitle(t`Duplicate "${dashboard.name}" and its questions`);
    }
  };

  return (
    <EntityCopyModal
      entityType="dashboards"
      entityObject={{
        ...dashboard,
        collection_id: initialCollectionId,
      }}
      form={Dashboards.forms.duplicate}
      title={title}
      overwriteOnInitialValuesChange
      copy={object =>
        copyDashboard({ id: initialDashboardId }, dissoc(object, "id"))
      }
      onClose={onClose}
      onSaved={dashboard => onReplaceLocation(Urls.dashboard(dashboard))}
      {...props}
      onValuesChange={handleValuesChange}
    />
  );
};

const DashboardCopyModal = _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(DashboardCopyModalInner);

export default DashboardCopyModal;
