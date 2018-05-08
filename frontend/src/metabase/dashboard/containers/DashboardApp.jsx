/* @flow */

import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import title from "metabase/hoc/Title";

import Dashboard from "metabase/dashboard/components/Dashboard.jsx";

import { fetchDatabaseMetadata } from "metabase/redux/metadata";
import { setErrorPage } from "metabase/redux/app";

import {
  getIsEditing,
  getIsEditingParameter,
  getIsDirty,
  getDashboardComplete,
  getCardList,
  getRevisions,
  getCardData,
  getSlowCards,
  getEditingParameter,
  getParameters,
  getParameterValues,
} from "../selectors";
import { getDatabases, getMetadata } from "metabase/selectors/metadata";
import { getUserIsAdmin } from "metabase/selectors/user";

import * as dashboardActions from "../dashboard";
import { archiveDashboard } from "metabase/dashboards/dashboards";
import { parseHashOptions } from "metabase/lib/browser";

const mapStateToProps = (state, props) => {
  return {
    dashboardId: props.dashboardId || props.params.dashboardId,

    isAdmin: getUserIsAdmin(state, props),
    isEditing: getIsEditing(state, props),
    isEditingParameter: getIsEditingParameter(state, props),
    isDirty: getIsDirty(state, props),
    dashboard: getDashboardComplete(state, props),
    cards: getCardList(state, props),
    revisions: getRevisions(state, props),
    dashcardData: getCardData(state, props),
    slowCards: getSlowCards(state, props),
    databases: getDatabases(state, props),
    editingParameter: getEditingParameter(state, props),
    parameters: getParameters(state, props),
    parameterValues: getParameterValues(state, props),
    metadata: getMetadata(state),
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  archiveDashboard,
  fetchDatabaseMetadata,
  setErrorPage,
  onChangeLocation: push,
};

type DashboardAppState = {
  addCardOnLoad: number | null,
};

@connect(mapStateToProps, mapDispatchToProps)
@title(({ dashboard }) => dashboard && dashboard.name)
export default class DashboardApp extends Component {
  state: DashboardAppState = {
    addCardOnLoad: null,
  };

  componentWillMount() {
    let options = parseHashOptions(window.location.hash);
    if (options.add) {
      this.setState({ addCardOnLoad: parseInt(options.add) });
    }
  }

  render() {
    return (
      <div>
        <Dashboard addCardOnLoad={this.state.addCardOnLoad} {...this.props} />
        {/* For rendering modal urls */}
        {this.props.children}
      </div>
    );
  }
}
