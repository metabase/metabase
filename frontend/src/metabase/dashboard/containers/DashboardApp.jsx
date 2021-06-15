/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import { push } from "react-router-redux";
import { withRouter } from "react-router";
import fitViewport from "metabase/hoc/FitViewPort";
import title from "metabase/hoc/Title";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";
import Modal from "metabase/components/Modal";
import ConfirmContent from "metabase/components/ConfirmContent";

import Dashboard from "metabase/dashboard/components/Dashboard";

import { fetchDatabaseMetadata } from "metabase/redux/metadata";
import { setErrorPage } from "metabase/redux/app";

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
} from "../selectors";
import { getDatabases, getMetadata } from "metabase/selectors/metadata";
import { getUserIsAdmin } from "metabase/selectors/user";

import * as dashboardActions from "../dashboard";
import { parseHashOptions } from "metabase/lib/browser";
import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";

const mapStateToProps = (state, props) => {
  return {
    dashboardId: props.dashboardId || Urls.extractEntityId(props.params.slug),

    isAdmin: getUserIsAdmin(state, props),
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
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  archiveDashboard: id => Dashboards.actions.setArchived({ id }, true),
  fetchDatabaseMetadata,
  setErrorPage,
  onChangeLocation: push,
  push,
};

type DashboardAppState = {
  addCardOnLoad: number | null,
  nextLocation: Boolean,
  confirmed: Boolean,
};

@withRouter
@connect(
  mapStateToProps,
  mapDispatchToProps,
)
@fitViewport
@title(({ dashboard }) => dashboard && dashboard.name)
@titleWithLoadingTime("loadingStartTime")
// NOTE: should use DashboardControls and DashboardData HoCs here?
export default class DashboardApp extends Component {
  state: DashboardAppState = {
    addCardOnLoad: null,
    nextLocation: false,
    confirmed: false,
  };

  UNSAFE_componentWillMount() {
    this.props.router.setRouteLeaveHook(this.props.route, this.routerWillLeave);

    const options = parseHashOptions(window.location.hash);
    if (options.add) {
      this.setState({ addCardOnLoad: parseInt(options.add) });
    }
  }

  routerWillLeave = nextLocation => {
    if (this.props.isDirty && !this.state.confirmed) {
      this.setState({ nextLocation: nextLocation, confirmed: false });
      return false;
    }
  };

  render() {
    const { nextLocation } = this.state;
    const { push } = this.props;

    return (
      <div className="shrink-below-content-size full-height">
        <Dashboard addCardOnLoad={this.state.addCardOnLoad} {...this.props} />
        {/* For rendering modal urls */}
        {this.props.children}
        <Modal isOpen={nextLocation}>
          <ConfirmContent
            title={t`You have unsaved changes`}
            message={t`Do you want to leave this page and discard your changes?`}
            onClose={() => {
              this.setState({ nextLocation: false });
            }}
            onAction={() => {
              this.setState({ nextLocation: false, confirmed: true }, () => {
                push(nextLocation.pathname, nextLocation.state);
              });
            }}
          />
        </Modal>
      </div>
    );
  }
}
