/* @flow */

import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import Dashboard from "../components/Dashboard.jsx";

import { getIsEditing, getIsEditingParameter, getIsDirty, getSelectedDashboard, getDashboardComplete, getCardList, getRevisions, getCardData, getCardDurations, getDatabases, getEditingParameter, getParameterValues } from "../selectors";
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
    componentDidMount() {
        if (this.props.addCardOnLoad != null) {
            this.props.onChangeLocationSearch("add", null);
        }
    }
    render() {
        return <Dashboard {...this.props} onDashboardDeleted={(id) => this.props.onBroadcast("dashboard:delete", id)}/>;
    }
}
