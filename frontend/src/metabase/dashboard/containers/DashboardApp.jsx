/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import title from "metabase/hoc/Title";
import favicon from "metabase/hoc/Favicon";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";

import Dashboard from "metabase/dashboard/components/Dashboard/Dashboard";

import { fetchDatabaseMetadata } from "metabase/redux/metadata";
import { getIsNavbarOpen, setErrorPage } from "metabase/redux/app";

import {
  getIsEditing,
  getIsSharing,
  getDashboardBeforeEditing,
  getIsEditingParameter,
  getIsDirty,
  getDashboardComplete,
  getCardData,
  getSlowCards,
  getEditingParameter,
  getParameters,
  getParameterValues,
  getLoadingStartTime,
  getClickBehaviorSidebarDashcard,
  getIsAddParameterPopoverOpen,
  getSidebar,
  getShowAddQuestionSidebar,
  getFavicon,
  getDocumentTitle,
} from "../selectors";
import { getDatabases, getMetadata } from "metabase/selectors/metadata";
import {
  getUserIsAdmin,
  canManageSubscriptions,
} from "metabase/selectors/user";

import * as dashboardActions from "../actions";
import { parseHashOptions } from "metabase/lib/browser";
import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";

const mapStateToProps = (state, props) => {
  return {
    dashboardId: props.dashboardId || Urls.extractEntityId(props.params.slug),

    canManageSubscriptions: canManageSubscriptions(state, props),
    isAdmin: getUserIsAdmin(state, props),
    isNavbarOpen: getIsNavbarOpen(state),
    isEditing: getIsEditing(state, props),
    isSharing: getIsSharing(state, props),
    dashboardBeforeEditing: getDashboardBeforeEditing(state, props),
    isEditingParameter: getIsEditingParameter(state, props),
    isDirty: getIsDirty(state, props),
    dashboard: getDashboardComplete(state, props),
    dashcardData: getCardData(state, props),
    slowCards: getSlowCards(state, props),
    databases: getDatabases(state, props),
    editingParameter: getEditingParameter(state, props),
    parameters: getParameters(state, props),
    parameterValues: getParameterValues(state, props),
    metadata: getMetadata(state),
    loadingStartTime: getLoadingStartTime(state),
    clickBehaviorSidebarDashcard: getClickBehaviorSidebarDashcard(state),
    isAddParameterPopoverOpen: getIsAddParameterPopoverOpen(state),
    sidebar: getSidebar(state),
    showAddQuestionSidebar: getShowAddQuestionSidebar(state),
    pageFavicon: getFavicon(state),
    documentTitle: getDocumentTitle(state),
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  archiveDashboard: id => Dashboards.actions.setArchived({ id }, true),
  fetchDatabaseMetadata,
  setErrorPage,
  onChangeLocation: push,
};

@connect(mapStateToProps, mapDispatchToProps)
@favicon(({ pageFavicon }) => pageFavicon)
@title(({ dashboard, documentTitle }) => ({
  title: documentTitle || dashboard?.name,
  titleIndex: 1,
}))
@titleWithLoadingTime("loadingStartTime")
// NOTE: should use DashboardControls and DashboardData HoCs here?
export default class DashboardApp extends Component {
  state = {
    addCardOnLoad: null,
  };

  UNSAFE_componentWillMount() {
    const options = parseHashOptions(window.location.hash);

    if (options) {
      this.setState({
        editingOnLoad: options.edit,
        addCardOnLoad: options.add && parseInt(options.add),
      });
    }
  }

  componentWillUnmount() {
    this.props.reset();
  }

  render() {
    const { editingOnLoad, addCardOnLoad } = this.state;

    return (
      <div className="shrink-below-content-size full-height">
        <Dashboard
          editingOnLoad={editingOnLoad}
          addCardOnLoad={addCardOnLoad}
          {...this.props}
        />
        {/* For rendering modal urls */}
        {this.props.children}
      </div>
    );
  }
}
