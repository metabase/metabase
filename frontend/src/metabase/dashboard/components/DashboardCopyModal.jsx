/* eslint-disable react/prop-types */
import { useState } from "react";
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

const getTitle = (dashboard, isShallowCopy) => {
  if (!dashboard?.name) {
    return "";
  } else if (isShallowCopy) {
    return t`Duplicate "${dashboard.name}"`;
  } else {
    return t`Duplicate "${dashboard.name}" and its questions`;
  }
};

const DashboardCopyModal = ({
  onClose,
  onReplaceLocation,
  copyDashboard,
  dashboard,
  initialCollectionId,
  params,
  ...props
}) => {
  const [isShallowCopy, setIsShallowCopy] = useState(true);
  const initialDashboardId = Urls.extractEntityId(params.slug);

  const title = getTitle(dashboard, isShallowCopy);

  const handleValuesChange = ({ is_shallow_copy }) => {
    setIsShallowCopy(is_shallow_copy);
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

export const DashboardCopyModalConnected = _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(DashboardCopyModal);
