import React from "react";
import { connect } from "react-redux";
import type { Location } from "history";

import DashboardApp from "metabase/dashboard/containers/DashboardApp";
import DataAppNavbarContainer from "metabase/nav/containers/MainNavbar/DataAppNavbar";

import { getIsEditing } from "metabase/dashboard/selectors";

import type { State } from "metabase-types/store";

interface DataAppPageLandingOwnProps {
  location: Location;
  params: {
    slug: string; // data app ID
    pageId: string;
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
  };
}

function DataAppPageLanding({ isEditing, ...props }: DataAppPageLandingProps) {
  return (
    <>
      {!isEditing && (
        <div className="bg-white border-bottom pt1">
          <div className="px2">
            <DataAppNavbarContainer />
          </div>
        </div>
      )}
      <DashboardApp {...props} />
    </>
  );
}

export default connect(mapStateToProps)(DataAppPageLanding);
