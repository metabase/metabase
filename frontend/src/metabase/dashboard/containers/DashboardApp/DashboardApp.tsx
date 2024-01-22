import type { ReactNode } from "react";
import { useCallback, useEffect } from "react";
import type { Location } from "history";
import { useUnmount } from "react-use";
import type { Route } from "react-router";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";
import { t } from "ttag";

import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";

import title from "metabase/hoc/Title";
import favicon from "metabase/hoc/Favicon";
import titleWithLoadingTime from "metabase/hoc/TitleWithLoadingTime";
import { useLoadingTimer } from "metabase/hooks/use-loading-timer";
import { useWebNotification } from "metabase/hooks/use-web-notification";
import { useUniqueId } from "metabase/hooks/use-unique-id";

import { closeNavbar, setErrorPage } from "metabase/redux/app";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { getMetadata } from "metabase/selectors/metadata";
import {
  canManageSubscriptions,
  getUserIsAdmin,
} from "metabase/selectors/user";

import { parseHashOptions } from "metabase/lib/browser";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";

import { Dashboard } from "metabase/dashboard/components/Dashboard/Dashboard";
import Dashboards from "metabase/entities/dashboards";

import type {
  Dashboard as IDashboard,
  DashboardId,
  DashCardDataMap,
  DashCardId,
  DatabaseId,
  Parameter,
  ParameterId,
  ParameterValueOrArray,
} from "metabase-types/api";
import type { SelectedTabId, State, StoreDashcard } from "metabase-types/store";
import type Database from "metabase-lib/metadata/Database";
import type { UiParameter } from "metabase-lib/parameters/types";
import type Metadata from "metabase-lib/metadata/Metadata";

import * as dashboardActions from "../../actions";
import { DASHBOARD_SLOW_TIMEOUT } from "../../constants";
import {
  getCardData,
  getClickBehaviorSidebarDashcard,
  getDashboardBeforeEditing,
  getDashboardComplete,
  getDocumentTitle,
  getDraftParameterValues,
  getEditingParameter,
  getFavicon,
  getIsAdditionalInfoVisible,
  getIsAddParameterPopoverOpen,
  getIsAutoApplyFilters,
  getIsDirty,
  getIsEditing,
  getIsEditingParameter,
  getIsHeaderVisible,
  getIsLoadingComplete,
  getIsNavigatingBackToDashboard,
  getIsRunning,
  getIsSharing,
  getLoadingStartTime,
  getParameters,
  getParameterValues,
  getSelectedTabId,
  getSidebar,
  getSlowCards,
} from "../../selectors";

type OwnProps = {
  dashboardId?: DashboardId;
  route: Route;
  params: { slug: string };
  children?: ReactNode;
};

type StateProps = {
  canManageSubscriptions: boolean;
  isAdmin: boolean;
  isNavbarOpen: boolean;
  isEditing: boolean;
  isSharing: boolean;
  dashboardBeforeEditing: IDashboard | null;
  isEditingParameter: boolean;
  isDirty: boolean;
  dashboard: IDashboard | null;
  dashcardData: DashCardDataMap;
  slowCards: Record<DashCardId, unknown>;
  databases: Record<DatabaseId, Database>;
  editingParameter?: Parameter | null;
  parameters: UiParameter[];
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  draftParameterValues: Record<ParameterId, ParameterValueOrArray | null>;
  metadata: Metadata;
  loadingStartTime: number | null;
  clickBehaviorSidebarDashcard: StoreDashcard | null;
  isAddParameterPopoverOpen: boolean;
  sidebar: State["dashboard"]["sidebar"];
  pageFavicon: string | null;
  documentTitle: string | undefined;
  isRunning: boolean;
  isLoadingComplete: boolean;
  isHeaderVisible: boolean;
  isAdditionalInfoVisible: boolean;
  selectedTabId: SelectedTabId;
  isAutoApplyFilters: boolean;
  isNavigatingBackToDashboard: boolean;
};

type DispatchProps = {
  archiveDashboard: (id: DashboardId) => Promise<void>;
  closeNavbar: () => void;
  setErrorPage: (error: unknown) => void;
  onChangeLocation: (location: Location) => void;
};

type DashboardAppProps = OwnProps & StateProps & DispatchProps;

const mapStateToProps = (state: State): StateProps => {
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
  archiveDashboard: (id: DashboardId) =>
    Dashboards.actions.setArchived({ id }, true),
  setErrorPage,
  onChangeLocation: push,
};

const DashboardApp = (props: DashboardAppProps) => {
  const { dashboard, isRunning, isLoadingComplete, isEditing, isDirty, route } =
    props;

  const options = parseHashOptions(window.location.hash);
  const editingOnLoad = options.edit;
  const addCardOnLoad = options.add != null ? Number(options.add) : undefined;

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

function getDashboardId({ dashboardId, params }: DashboardAppProps) {
  if (dashboardId) {
    return dashboardId;
  }
  return Urls.extractEntityId(params.slug);
}

export const DashboardAppConnected = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  favicon(({ pageFavicon }: StateProps) => pageFavicon),
  title(({ dashboard, documentTitle }: StateProps) => ({
    title: documentTitle || dashboard?.name,
    titleIndex: 1,
  })),
  titleWithLoadingTime("loadingStartTime"),
)(DashboardApp);
