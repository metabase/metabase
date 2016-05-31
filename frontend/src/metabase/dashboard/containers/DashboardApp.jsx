/* @flow */

import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import Dashboard from "../components/Dashboard.jsx";

import { getIsEditing, getIsEditingParameter, getIsDirty, getSelectedDashboard, getDashboardComplete, getCardList, getRevisions, getCardData, getCardDurations, getDatabases, getEditingParameter } from "../selectors";
import * as dashboardActions from "../dashboard";
import { fetchDatabaseMetadata } from "../metadata";

const mapStateToProps = (state, props) => {
  return {
      isEditing:            getIsEditing(state),
      isEditingParameter:   getIsEditingParameter(state),
      isDirty:              getIsDirty(state),
      selectedDashboard:    getSelectedDashboard(state),
      dashboard:            getDashboardComplete(state),
      cards:                getCardList(state),
      revisions:            getRevisions(state),
      cardData:             getCardData(state),
      cardDurations:        getCardDurations(state),
      databases:            getDatabases(state),
      editingParameter:     getEditingParameter(state)
  }
}

const mapDispatchToProps = {
    ...dashboardActions,
    fetchDatabaseMetadata
}

@connect(mapStateToProps, mapDispatchToProps)
export default class DashboardApp extends Component {
    render() {
        return <Dashboard {...this.props} />;
    }
}
