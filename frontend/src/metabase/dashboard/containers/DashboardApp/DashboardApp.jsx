import { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import { useUnmount } from "react-use";
import { t } from "ttag";
import useBeforeUnload from "metabase/hooks/use-before-unload";

import title from "metabase/hoc/Title";
import favicon from "metabase/hoc/Favicon";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";

import Dashboard from "metabase/dashboard/components/Dashboard/Dashboard";

import { useLoadingTimer } from "metabase/hooks/use-loading-timer";
import { useWebNotification } from "metabase/hooks/use-web-notification";

import { closeNavbar, getIsNavbarOpen, setErrorPage } from "metabase/redux/app";

import { getMetadata } from "metabase/selectors/metadata";
import {
  canManageSubscriptions,
  getUserIsAdmin,
} from "metabase/selectors/user";

import { getEmbedOptions } from "metabase/selectors/embed";

import { parseHashOptions } from "metabase/lib/browser";
import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";

import { useDispatch } from "metabase/lib/redux";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { saveDashboardPdf } from "metabase/visualizations/lib/save-dashboard-pdf";
import { trackExportDashboardToPDF } from "metabase/dashboard/analytics";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { Box } from "metabase/ui";
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
  getisNavigatingBackToDashboard,
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
    embedOptions: getEmbedOptions(state),
    selectedTabId: getSelectedTabId(state),
    isAutoApplyFilters: getIsAutoApplyFilters(state),
    isNavigatingBackToDashboard: getisNavigatingBackToDashboard(state),
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
  const { dashboard, isRunning, isLoadingComplete, isEditing, isDirty } = props;

  const options = parseHashOptions(window.location.hash);
  const editingOnLoad = options.edit;
  const addCardOnLoad = options.add && parseInt(options.add);

  const [isWaitingForPDF, setIsWaitingForPDF] = useState(false);

  const dispatch = useDispatch();

  const { requestPermission, showNotification } = useWebNotification();

  useUnmount(() => {
    dispatch(dashboardActions.reset());
    dispatch(dashboardActions.closeDashboard());
  });

  const slowToastId = useUniqueId();
  const pdfToastID = useUniqueId();
  useBeforeUnload(isEditing && isDirty);

  const saveAsPDF = useCallback(() => {
    const cardNodeSelector = "#Dashboard-Cards-Container";
    saveDashboardPdf(cardNodeSelector, dashboard.name).then(() => {
      trackExportDashboardToPDF(dashboard.id);
    });
    dispatch(dismissUndo(pdfToastID));
  }, [dashboard?.id, dashboard?.name, dispatch, pdfToastID]);

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

      if (isWaitingForPDF) {
        saveAsPDF();
      }
    }

    return () => {
      dispatch(dismissUndo(slowToastId));
      dispatch(dismissUndo(pdfToastID));
    };
  }, [
    dashboard?.name,
    dispatch,
    isLoadingComplete,
    isWaitingForPDF,
    pdfToastID,
    saveAsPDF,
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

  const onCancelPDF = useCallback(() => {
    setIsWaitingForPDF(false);
    dispatch(dismissUndo(pdfToastID));
  }, [dispatch, pdfToastID]);

  const onPDFTimeout = useCallback(() => {
    if (isLoadingComplete) {
      saveAsPDF();
    } else if (!isWaitingForPDF) {
      setIsWaitingForPDF(true);
    }
  }, [isLoadingComplete, isWaitingForPDF, saveAsPDF]);

  useEffect(() => {
    if (isWaitingForPDF) {
      dispatch(
        addUndo({
          id: pdfToastID,
          icon: (
            <Box pr="0.75rem">
              <LoadingSpinner size={24} />
            </Box>
          ),
          timeout: false,
          message: t`Waiting for the dashboard to load before exporting…`,
          canDismiss: true,
          action: onCancelPDF,
          actionLabel: t`Cancel`,
        }),
      );
    }
  }, [dispatch, isWaitingForPDF, onCancelPDF, pdfToastID]);

  useLoadingTimer(isRunning, {
    timer: DASHBOARD_SLOW_TIMEOUT,
    onTimeout,
  });

  return (
    <div className="shrink-below-content-size full-height">
      <Dashboard
        dashboardId={getDashboardId(props)}
        editingOnLoad={editingOnLoad}
        addCardOnLoad={addCardOnLoad}
        onSaveAsPDF={onPDFTimeout}
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
