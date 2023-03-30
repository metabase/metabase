/* eslint-disable react/prop-types */
import React, { useCallback, useEffect, useState } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import { useTimeout, useUnmount } from "react-use";

import { t } from "ttag";

import title from "metabase/hoc/Title";
import favicon from "metabase/hoc/Favicon";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";

import Dashboard from "metabase/dashboard/components/Dashboard/Dashboard";
import Toaster, { useToaster } from "metabase/components/Toaster";

import { useLoadingTimer } from "metabase/hooks/use-loading-timer";
import { useWebNotification } from "metabase/hooks/use-web-notification";

import { fetchDatabaseMetadata } from "metabase/redux/metadata";
import { getIsNavbarOpen, closeNavbar, setErrorPage } from "metabase/redux/app";

import { getMetadata } from "metabase/selectors/metadata";
import {
  getUserIsAdmin,
  canManageSubscriptions,
} from "metabase/selectors/user";

import { getEmbedOptions } from "metabase/selectors/embed";

import { parseHashOptions } from "metabase/lib/browser";
import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";

import * as dashboardActions from "../actions";
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
  getDraftParameterValues,
  getLoadingStartTime,
  getClickBehaviorSidebarDashcard,
  getIsAddParameterPopoverOpen,
  getSidebar,
  getFavicon,
  getDocumentTitle,
  getIsRunning,
  getIsLoadingComplete,
  getIsHeaderVisible,
  getIsAdditionalInfoVisible,
} from "../selectors";
import { DASHBOARD_SLOW_TIMEOUT } from "../constants";

function getDashboardId({ dashboardId, params }) {
  if (dashboardId) {
    return dashboardId;
  }
  return Urls.extractEntityId(params.slug);
}

const mapStateToProps = (state, props) => {
  const metadata = getMetadata(state);
  return {
    dashboardId: getDashboardId(props),
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
    databases: metadata.databases,
    editingParameter: getEditingParameter(state, props),
    parameters: getParameters(state, props),
    parameterValues: getParameterValues(state, props),
    draftParameterValues: getDraftParameterValues(state, props),
    metadata,
    loadingStartTime: getLoadingStartTime(state),
    clickBehaviorSidebarDashcard: getClickBehaviorSidebarDashcard(state),
    isAddParameterPopoverOpen: getIsAddParameterPopoverOpen(state),
    sidebar: getSidebar(state),
    pageFavicon: getFavicon(state),
    documentTitle: getDocumentTitle(state),
    isRunning: getIsRunning(state),
    isLoadingComplete: getIsLoadingComplete(state),
    isHeaderVisible: getIsHeaderVisible(state),
    isAdditionalInfoVisible: getIsAdditionalInfoVisible(state),
    embedOptions: getEmbedOptions(state),
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  closeNavbar,
  archiveDashboard: id => Dashboards.actions.setArchived({ id }, true),
  fetchDatabaseMetadata,
  setErrorPage,
  onChangeLocation: push,
};

// NOTE: should use DashboardControls and DashboardData HoCs here?
const DashboardApp = props => {
  const { isRunning, isLoadingComplete, dashboard } = props;

  const options = parseHashOptions(window.location.hash);
  const editingOnLoad = options.edit;
  const addCardOnLoad = options.add && parseInt(options.add);

  const [isShowingSlowToaster, setIsShowingSlowToaster] = useState(false);

  const onTimeout = useCallback(() => {
    if ("Notification" in window && Notification.permission === "default") {
      setIsShowingSlowToaster(true);
    }
  }, []);

  useLoadingTimer(isRunning, {
    timer: DASHBOARD_SLOW_TIMEOUT,
    onTimeout,
  });

  const [requestPermission, showNotification] = useWebNotification();

  useUnmount(props.reset);

  useEffect(() => {
    if (isLoadingComplete) {
      setIsShowingSlowToaster(false);
      if (
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.hidden
      ) {
        showNotification(
          t`All Set! ${dashboard?.name} is ready.`,
          t`All questions loaded`,
        );
      }
    }
  }, [isLoadingComplete, showNotification, dashboard?.name]);

  const onConfirmToast = useCallback(async () => {
    await requestPermission();
    setIsShowingSlowToaster(false);
  }, [requestPermission]);

  const onDismissToast = useCallback(() => {
    setIsShowingSlowToaster(false);
  }, []);

  const { parameterValues } = props;

  const [shouldShowAutoApplyFiltersToast, cancel, reset] = useTimeout(
    DASHBOARD_SLOW_TIMEOUT,
  );
  useEffect(() => {
    if (isLoadingComplete && !shouldShowAutoApplyFiltersToast()) {
      cancel();
    }
    return () => cancel;
  }, [cancel, isLoadingComplete, shouldShowAutoApplyFiltersToast]);

  useEffect(() => {
    const isShowingAutoApplyFiltersToast =
      dashboard?.auto_apply_filters &&
      !_.isEmpty(parameterValues) &&
      isLoadingComplete &&
      shouldShowAutoApplyFiltersToast();

    if (isShowingAutoApplyFiltersToast) {
      autoApplyFiltersToasterApi.show({
        message: t`You can make this dashboard snappier by turning off auto-applying filters.`,
        confirmText: t`Turn off`,
      });
    }
  }, [
    autoApplyFiltersToasterApi,
    dashboard?.auto_apply_filters,
    isLoadingComplete,
    parameterValues,
    shouldShowAutoApplyFiltersToast,
  ]);

  const [autoApplyFiltersToasterApi, autoApplyFiltersToaster] = useToaster();

  // Display toasts only when
  // 1. dashboard.auto_apply_filters = false
  // 2. dashboard has filters applied
  // 3. when all dashboard cards are loaded but after the 15s timeout, which is when we determine that the dashboard is slow
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
        message={t`Would you like to be notified when this dashboard is done loading?`}
        isShown={isShowingSlowToaster}
        onDismiss={onDismissToast}
        onConfirm={onConfirmToast}
        fixed
      />
      {/* XXX: Make toaster stackable */}
      {/* XXX: Make toaster longer */}
      {autoApplyFiltersToaster}
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
