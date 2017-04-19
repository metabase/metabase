/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import title from "metabase/hoc/Title";

import Dashboard from "../components/Dashboard.jsx";

import { fetchDatabaseMetadata } from "metabase/redux/metadata";
import { setErrorPage } from "metabase/redux/app";

import { getIsEditing, getIsEditingParameter, getIsDirty, getDashboardComplete, getCardList, getRevisions, getCardData, getCardDurations, getDatabases, getEditingParameter, getParameterValues } from "../selectors";
import { getUserIsAdmin } from "metabase/selectors/user";

import * as dashboardActions from "../dashboard";
import {deleteDashboard} from "metabase/dashboards/dashboards"

const mapStateToProps = (state, props) => {
  return {
      isAdmin:              getUserIsAdmin(state, props),
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
    deleteDashboard,
    fetchDatabaseMetadata,
    setErrorPage,
    onChangeLocation: push
}

@connect(mapStateToProps, mapDispatchToProps)
@title(({ dashboard }) => dashboard && dashboard.name)
export default class DashboardApp extends Component {
    render() {
        return <Dashboard {...this.props} />;
    }
}
