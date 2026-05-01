import { dissoc } from "icepick";
import { useState } from "react";
import { type WithRouterProps, withRouter } from "react-router";
import { replace } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { useInitialCollectionId } from "metabase/collections/hooks";
import type { CopyDashboardFormProperties } from "metabase/dashboard/containers/CopyDashboardForm";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import { Dashboards } from "metabase/entities/dashboards";
import { connect, useSelector } from "metabase/redux";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

import { getDashboardComplete } from "../selectors";

type OwnProps = {
  onClose: () => void;
};

const mapDispatchToProps = {
  copyDashboard: Dashboards.actions.copy,
  onReplaceLocation: replace,
};

type DispatchProps = typeof mapDispatchToProps;

type DashboardCopyModalProps = OwnProps & DispatchProps & WithRouterProps;

const getTitle = (
  dashboard: Dashboard | null,
  isShallowCopy: boolean,
): string => {
  if (!dashboard?.name) {
    return "";
  }

  return isShallowCopy
    ? t`Duplicate "${dashboard.name}"`
    : t`Duplicate "${dashboard.name}" and its questions`;
};

const DashboardCopyModal = ({
  onClose,
  onReplaceLocation,
  copyDashboard,
  params,
  location,
}: DashboardCopyModalProps) => {
  const dashboard = useSelector(getDashboardComplete);
  const initialCollectionId = useInitialCollectionId({
    collectionId: dashboard?.collection_id,
    params,
    location,
  });
  const [isShallowCopy, setIsShallowCopy] = useState(true);
  const dashboardIdFromSlug = Urls.extractEntityId(params?.slug);

  const title = getTitle(dashboard, isShallowCopy);

  const handleValuesChange = (values: CopyDashboardFormProperties) => {
    if (
      "is_shallow_copy" in values &&
      typeof values.is_shallow_copy === "boolean"
    ) {
      setIsShallowCopy(values.is_shallow_copy);
    }
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
      onSaved={(savedDashboard: Dashboard) =>
        onReplaceLocation(Urls.dashboard(savedDashboard))
      }
      onValuesChange={handleValuesChange}
    />
  );
};

export const DashboardCopyModalConnected = _.compose(
  withRouter,
  connect(null, mapDispatchToProps),
)(DashboardCopyModal);
