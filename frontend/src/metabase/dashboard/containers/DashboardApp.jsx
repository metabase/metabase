/* eslint-disable react/prop-types */
import React, { useEffect, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";

import title from "metabase/hoc/Title";
import favicon from "metabase/hoc/Favicon";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";

import Dashboard from "metabase/dashboard/components/Dashboard/Dashboard";
import Toaster from "metabase/components/Toaster";

import { useLoadingTimer } from "metabase/hooks/use-loading-timer";
import { useWebNotification } from "metabase/hooks/use-web-notification";

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
  getLoadingComplete,
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
    loadingComplete: getLoadingComplete(state),
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  archiveDashboard: id => Dashboards.actions.setArchived({ id }, true),
  fetchDatabaseMetadata,
  setErrorPage,
  onChangeLocation: push,
};

// NOTE: should use DashboardControls and DashboardData HoCs here?
const DashboardApp = props => {
  const options = parseHashOptions(window.location.hash);
  const { loadingComplete, dashboard } = props;

  const [addCardOnLoad] = useState(options.edit);
  const [editingOnLoad] = useState(options.add && parseInt(options.add));

  const [sendNotification, setSendNotification] = useState(false);
  const [showToaster, setShowToaster] = useState(false);

  const toastTrigger = useLoadingTimer(!loadingComplete, 5000);
  const [requestPermission, showNotification] = useWebNotification();

  useEffect(() => {
    return props.reset;
  }, [props.reset]);

  useEffect(() => {
    if (toastTrigger) {
      setShowToaster(true);
    }
  }, [toastTrigger]);

  useEffect(() => {
    if (loadingComplete) {
      setShowToaster(false);
    }
    if (loadingComplete && sendNotification) {
      showNotification(
        `All Set! ${dashboard.name} is ready.`,
        `All questions loaded`,
      );
    }
  }, [loadingComplete, sendNotification, showNotification, dashboard.name]);

  const handleToastConfirm = async () => {
    const result = await requestPermission();
    if (result === "granted") {
      setShowToaster(false);
      setSendNotification(true);
    }
  };

  return (
    <div className="shrink-below-content-size full-height">
      <Dashboard
        editingOnLoad={editingOnLoad}
        addCardOnLoad={addCardOnLoad}
        {...props}
      />
      {/* For rendering modal urls */}
      {props.children}
      <Toaster
        message="Would you like to be notified when this dashboard is done loading?"
        show={showToaster}
        onDismiss={() => setShowToaster(false)}
        onConfirm={() => handleToastConfirm()}
        fixed
      />
    </div>
  );
};

export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  favicon(({ pageFavicon }) => pageFavicon),
  title(({ dashboard, documentTitle }) => ({
    title: documentTitle || dashboard?.name,
    titleIndex: 1,
  })),
  titleWithLoadingTime("loadingStartTime"),
)(DashboardApp);
