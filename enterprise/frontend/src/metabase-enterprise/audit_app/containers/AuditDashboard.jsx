/* eslint-disable react/prop-types */
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { getMetadata } from "metabase/selectors/metadata";

import { Dashboard } from "metabase/dashboard/containers/Dashboard";
import { DashboardData } from "metabase/dashboard/hoc/DashboardData";

const DashboardWithData = DashboardData(Dashboard);

import { getAccentColors } from "metabase/lib/colors/groups";
import { AuditMode } from "../lib/mode";

const AuditDashboard = ({ cards, ...props }) => (
  <DashboardWithData
    style={{ backgroundColor: "transparent", padding: 0 }}
    // HACK: to get inline dashboards working quickly
    dashboardId={{
      dashcards: cards.map(([{ x, y, w, h }, dc]) => ({
        col: x,
        row: y,
        size_x: w,
        size_y: h,
        visualization_settings: {
          // use the legacy "graph.colors" settings with color harmony to force brand color, etc
          "graph.colors": getAccentColors({ harmony: true }),
          // we want to hide the background to help make the charts feel
          // like they're part of the page, so turn off the background
          "dashcard.background": false,
        },
        ...dc,
      })),
    }}
    mode={AuditMode}
    // don't link card titles to the query builder
    noLink
    {...props}
  />
);

const mapStateToProps = (state, props) => ({
  metadata: getMetadata(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
};

export default connect(mapStateToProps, mapDispatchToProps)(AuditDashboard);
