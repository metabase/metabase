/* eslint-disable react/prop-types */
import { dissoc } from "icepick";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Collections } from "metabase/entities/collections";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import { Dashboards } from "metabase/entities/dashboards";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useRouter } from "metabase/router";
import { useNavigation } from "metabase/routing/compat";

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
  copyDashboard,
  dashboard,
  initialCollectionId,
  ...props
}) => {
  const { replace } = useNavigation();
  const { params } = useRouter();
  const [isShallowCopy, setIsShallowCopy] = useState(true);
  const dashboardIdFromSlug = Urls.extractEntityId(params.slug);

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
      copy={async (object) =>
        await copyDashboard({ id: dashboardIdFromSlug }, dissoc(object, "id"))
      }
      onClose={onClose}
      onSaved={(dashboard) => replace(Urls.dashboard(dashboard))}
      {...props}
      onValuesChange={handleValuesChange}
    />
  );
};

export const DashboardCopyModalConnected = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
)(DashboardCopyModal);
