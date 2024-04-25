/* eslint-disable react/prop-types */
import { dissoc } from "icepick";
import { useState } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { replace } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import Collections from "metabase/entities/collections";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import Dashboards from "metabase/entities/dashboards";
import * as Urls from "metabase/lib/urls";

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
      title={title}
      overwriteOnInitialValuesChange
      copy={async object =>
        await copyDashboard({ id: initialDashboardId }, dissoc(object, "id"))
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
