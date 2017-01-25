/* @flow */

import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import Dashboard from "../components/Dashboard.jsx";

import { fetchDatabaseMetadata } from "metabase/redux/metadata";

import { getIsEditing, getIsEditingParameter, getIsDirty, getDashboardComplete, getCardList, getRevisions, getCardData, getCardDurations, getDatabases, getEditingParameter, getParameterValues } from "../selectors";
import * as dashboardActions from "../dashboard";

const mapStateToProps = (state, props) => {
  return {
      isEditing:            getIsEditing(state, props),
      isEditingParameter:   getIsEditingParameter(state, props),
      isDirty:              getIsDirty(state, props),
      dashboard:            getDashboardComplete(state, props),
      cards:                getCardList(state, props),
      revisions:            getRevisions(state, props),
      dashcardData:         getCardData(state, props),
      cardDurations:        getCardDurations(state, props),
      databases:            getDatabases(state, props),
      editingParameter:     getEditingParameter(state, props),
      parameterValues:      getParameterValues(state, props),
      addCardOnLoad:        props.location.query.add ? parseInt(props.location.query.add) : null
  }
}

const mapDispatchToProps = {
    ...dashboardActions,
    fetchDatabaseMetadata,
    onChangeLocation: push
}

@connect(mapStateToProps, mapDispatchToProps)
export default class DashboardApp extends Component {
    render() {
        return <Dashboard {...this.props} />;
    }
}
