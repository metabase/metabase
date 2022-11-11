import React from "react";
import { connect } from "react-redux";
import { replace } from "react-router-redux";
import _ from "underscore";

import type { Location } from "history";

import { useDebouncedEffect } from "metabase/hooks/use-debounced-effect";

import DashboardApp from "metabase/dashboard/containers/DashboardApp";
import DataAppNavbarContainer from "metabase/nav/containers/MainNavbar/DataAppNavbar";

import DataApps from "metabase/entities/data-apps";
import { getDataAppIdForPage } from "metabase/entities/data-apps/utils";
import {
  getIsEditing,
  getDashboardComplete,
} from "metabase/dashboard/selectors";
import { getDataAppIdFromPath } from "metabase/lib/urls";

import type { DataAppPageId, DataApp, Dashboard } from "metabase-types/api";
import type { Dispatch, State } from "metabase-types/store";

interface DataAppPageLandingOwnProps {
  dashboardId?: DataAppPageId;
  location: Location;
  dashboard: Dashboard;
  dataApps: DataApp[];
  dispatch: Dispatch;
  params: {
    slug: string; // data app ID
    pageId?: string;
  };
}

interface DataAppPageLandingStateProps {
  isEditing: boolean;
}

type DataAppPageLandingProps = DataAppPageLandingOwnProps &
  DataAppPageLandingStateProps;

function mapStateToProps(state: State) {
  return {
    isEditing: getIsEditing(state),
    dashboard: getDashboardComplete(state),
  };
}

function DataAppPageLanding({
  isEditing,
  dashboard,
  dataApps,
  dispatch,
  ...props
}: DataAppPageLandingProps) {
  useDebouncedEffect(
    // we need to debounce this slightly because the dashboard and app id state changes happen at different times
    // which potentially causes infinite replacement loops
    () => {
      if (dashboard?.is_app_page && dataApps) {
        // check if we're in the correct app for this page
        const urlAppId = getDataAppIdFromPath(location.pathname);
        const pageAppId = getDataAppIdForPage(dashboard, dataApps);

        if (urlAppId !== pageAppId) {
          dispatch(replace(`/a/${pageAppId}/page/${dashboard.id}`));
        }
      }
    },
    10,
    [dashboard, dataApps, dispatch, location],
  );

  return (
    <>
      {!isEditing && <DataAppNavbarContainer />}
      <DashboardApp {...props} />
    </>
  );
}

export default _.compose(
  DataApps.loadList(),
  connect(mapStateToProps),
)(DataAppPageLanding);
