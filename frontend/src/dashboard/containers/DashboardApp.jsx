import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import Dashboard from "../components/Dashboard.jsx";
import { dashboardSelectors } from "../selectors";

@connect(dashboardSelectors)
export default class DashboardApp extends Component {
    render() {
        return <Dashboard {...this.props} />;
    }
}
