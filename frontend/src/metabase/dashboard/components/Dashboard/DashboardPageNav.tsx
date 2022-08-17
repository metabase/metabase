import React from "react";
import _ from "underscore";
import { connect } from "react-redux";

import type { State } from "metabase-types/store";
import type { Dashboard } from "metabase-types/api";

import { getCollections } from "metabase/collections/selectors";
import { getDashboard } from "metabase/dashboard/selectors";
import { dashboard as formatDashboardUrl } from "metabase/lib/urls";

import Search from "metabase/entities/search";

// we may want to use this more complex component down the road, but
// for now let's keep it simple
// import { Tree } from "metabase/components/tree";

import {
  AppTitle,
  DashboardNavContainer,
  DashboardNavItem,
} from "./DashboardPageNav.styled";

const mapStateToProps = (state: State) => ({
  currentDashboard: getDashboard(state),
  collections: getCollections(state),
});

function DashboardPageNav({
  list: dashboards,
  currentDashboard,
  collections,
}: {
  list: Dashboard[];
  currentDashboard: Dashboard;
  collections: any;
}) {
  const collectionId = currentDashboard?.collection_id;
  if (!collectionId) {
    return null;
  }

  const currentCollection = collections[collectionId];

  const pages = Object.values(dashboards).filter(
    d => d.collection_id === collectionId,
  );

  return (
    <DashboardNavContainer>
      <AppTitle>{currentCollection?.name ?? "Data App"}</AppTitle>
      {pages.map((page: Dashboard) => (
        <DashboardNavItem
          to={formatDashboardUrl(page)}
          key={page.id}
          active={page.id === currentDashboard.id}
        >
          {page?.name ?? "Unknown"}
        </DashboardNavItem>
      ))}
    </DashboardNavContainer>
  );
}

export default _.compose(
  connect(mapStateToProps),
  Search.loadList({
    query: (_: State, props: any) => ({
      collection: props.currentDashboard.collection_id,
      models: ["dashboard"],
      archived: false,
    }),
  }),
)(DashboardPageNav);
