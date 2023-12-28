import { useCallback, useEffect } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";
import title from "metabase/hoc/Title";
import favicon from "metabase/hoc/Favicon";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";

import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";

import { useLoadingTimer } from "metabase/hooks/use-loading-timer";
import { useWebNotification } from "metabase/hooks/use-web-notification";

import { closeNavbar, setErrorPage } from "metabase/redux/app";
import { getIsNavbarOpen } from "metabase/selectors/app";

import { getMetadata } from "metabase/selectors/metadata";
import {
  canManageSubscriptions,
  getUserIsAdmin,
} from "metabase/selectors/user";

import { parseHashOptions } from "metabase/lib/browser";
import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";

import { useDispatch } from "metabase/lib/redux";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import * as dashboardActions from "../../actions";
import {
  getCardData,
  getClickBehaviorSidebarDashcard,
  getDashboardBeforeEditing,
  getDashboardComplete,
  getDocumentTitle,
  getEditingParameter,
  getFavicon,
  getIsAdditionalInfoVisible,
  getIsAddParameterPopoverOpen,
  getIsDirty,
  getIsEditing,
  getIsEditingParameter,
  getIsHeaderVisible,
  getIsLoadingComplete,
  getIsRunning,
  getIsSharing,
  getLoadingStartTime,
  getParameters,
  getParameterValues,
  getDraftParameterValues,
  getSidebar,
  getSlowCards,
  getIsAutoApplyFilters,
  getSelectedTabId,
  getIsNavigatingBackToDashboard,
} from "../../selectors";
import { DASHBOARD_SLOW_TIMEOUT } from "../../constants";

function getDashboardId({ dashboardId, params }) {
  if (dashboardId) {
    return dashboardId;
  }
  return Urls.extractEntityId(params.slug);
}

const mapStateToProps = state => {
  const metadata = getMetadata(state);

  return {
    canManageSubscriptions: canManageSubscriptions(state),
    isAdmin: getUserIsAdmin(state),
    isNavbarOpen: getIsNavbarOpen(state),
    isEditing: getIsEditing(state),
    isSharing: getIsSharing(state),
    dashboardBeforeEditing: getDashboardBeforeEditing(state),
    isEditingParameter: getIsEditingParameter(state),
    isDirty: getIsDirty(state),
    dashboard: getDashboardComplete(state),
    dashcardData: getCardData(state),
    slowCards: getSlowCards(state),
    databases: metadata.databases,
    editingParameter: getEditingParameter(state),
    parameters: getParameters(state),
    parameterValues: getParameterValues(state),
    draftParameterValues: getDraftParameterValues(state),
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
    selectedTabId: getSelectedTabId(state),
    isAutoApplyFilters: getIsAutoApplyFilters(state),
    isNavigatingBackToDashboard: getIsNavigatingBackToDashboard(state),
  };
};

const mapDispatchToProps = {
  ...dashboardActions,
  closeNavbar,
  archiveDashboard: id => Dashboards.actions.setArchived({ id }, true),
  setErrorPage,
  onChangeLocation: push,
};

// NOTE: should use DashboardControls and DashboardData HoCs here?
const DashboardApp = props => {
  const { dashboard, isRunning, isLoadingComplete, isEditing, isDirty, route } =
    props;

  const options = parseHashOptions(window.location.hash);
  const editingOnLoad = options.edit;
  const addCardOnLoad = options.add && parseInt(options.add);

  const dispatch = useDispatch();

  const { requestPermission, showNotification } = useWebNotification();

  useUnmount(() => {
    dispatch(dashboardActions.reset());
    dispatch(dashboardActions.closeDashboard());
  });

  const slowToastId = useUniqueId();

  useEffect(() => {
    if (isLoadingComplete) {
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

    return () => {
      dispatch(dismissUndo(slowToastId));
    };
  }, [
    dashboard?.name,
    dispatch,
    isLoadingComplete,
    showNotification,
    slowToastId,
  ]);

  const onConfirmToast = useCallback(async () => {
    await requestPermission();
    dispatch(dismissUndo(slowToastId));
  }, [dispatch, requestPermission, slowToastId]);

  const onTimeout = useCallback(() => {
    if ("Notification" in window && Notification.permission === "default") {
      dispatch(
        addUndo({
          id: slowToastId,
          timeout: false,
          message: t`Would you like to be notified when this dashboard is done loading?`,
          action: onConfirmToast,
          actionLabel: t`Turn on`,
        }),
      );
    }
  }, [dispatch, onConfirmToast, slowToastId]);

  useLoadingTimer(isRunning, {
    timer: DASHBOARD_SLOW_TIMEOUT,
    onTimeout,
  });

  return (
    <div className="shrink-below-content-size full-height">
      <LeaveConfirmationModal isEnabled={isEditing && isDirty} route={route} />

      <Dashboard
        dashboardId={getDashboardId(props)}
        editingOnLoad={editingOnLoad}
        addCardOnLoad={addCardOnLoad}
        {...props}
      />
      {/* For rendering modal urls */}
      {props.children}
    </div>
  );
};

DashboardApp.propTypes = {
  dashboardId: PropTypes.number,
  isEditing: PropTypes.bool,
  isDirty: PropTypes.bool,
  isRunning: PropTypes.bool,
  isLoadingComplete: PropTypes.bool,
  dashboard: PropTypes.object,
  closeDashboard: PropTypes.func,
  reset: PropTypes.func,
  pageFavicon: PropTypes.string,
  documentTitle: PropTypes.string,
  loadingStartTime: PropTypes.number,
  isEditable: PropTypes.bool,
  isFullscreen: PropTypes.bool,
  isNightMode: PropTypes.bool,
  isNavBarOpen: PropTypes.bool,
  isAdditionalInfoVisible: PropTypes.bool,
  refreshPeriod: PropTypes.number,
  setRefreshElapsedHook: PropTypes.func,
  createBookmark: PropTypes.func,
  deleteBookmark: PropTypes.func,
  onChangeLocation: PropTypes.func,
  toggleSidebar: PropTypes.func,
  addActionToDashboard: PropTypes.func,
  triggerToast: PropTypes.func,
  saveDashboard: PropTypes.func,
  invalidateCollections: PropTypes.func,
  related: PropTypes.arrayOf(PropTypes.object),
  hasSidebar: PropTypes.bool,
  children: PropTypes.node,
  route: PropTypes.object,
};

export const DashboardAppConnected = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  favicon(({ pageFavicon }) => pageFavicon),
  title(({ dashboard, documentTitle }) => ({
    title: documentTitle || dashboard?.name,
    titleIndex: 1,
  })),
  titleWithLoadingTime("loadingStartTime"),
)(DashboardApp);
