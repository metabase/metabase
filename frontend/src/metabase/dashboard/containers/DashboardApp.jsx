/* @flow */

import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import Dashboard from "../components/Dashboard.jsx";

import { fetchDatabaseMetadata } from "metabase/redux/metadata";

import { getIsEditing, getIsEditingParameter, getIsDirty, getSelectedDashboard, getDashboardComplete, getCardList, getRevisions, getCardData, getCardDurations, getDatabases, getEditingParameter, getParameterValues } from "../selectors";
import * as dashboardActions from "../dashboard";

const mapStateToProps = (state, props) => {
  return {
      isEditing:            getIsEditing(state),
      isEditingParameter:   getIsEditingParameter(state),
      isDirty:              getIsDirty(state),
      selectedDashboard:    getSelectedDashboard(state),
      dashboard:            getDashboardComplete(state),
      cards:                getCardList(state),
      revisions:            getRevisions(state),
      dashcardData:             getCardData(state),
      cardDurations:        getCardDurations(state),
      databases:            getDatabases(state),
      editingParameter:     getEditingParameter(state),
      parameterValues:      getParameterValues(state),
      addCardOnLoad:        parseInt(state.router.location.query.add) || null
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
