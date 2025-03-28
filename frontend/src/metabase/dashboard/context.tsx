import type { Query } from "history";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ConnectedProps } from "react-redux";
import { push } from "react-router-redux";
import { usePrevious, useUnmount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import {
  addActionToDashboard,
  addCardToDashboard,
  addHeadingDashCardToDashboard,
  addIFrameDashCardToDashboard,
  addLinkDashCardToDashboard,
  addMarkdownDashCardToDashboard,
  addParameter,
  addSectionToDashboard,
  applyDraftParameterValues,
  cancelFetchDashboardCardData,
  closeDashboard,
  closeSidebar,
  fetchDashboard,
  fetchDashboardCardData,
  hideAddParameterPopover,
  initialize,
  navigateToNewCardFromDashboard,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardColumnSettings,
  onUpdateDashCardVisualizationSettings,
  removeParameter,
  reset,
  resetParameters,
  setDashboardAttributes,
  setEditingDashboard,
  setParameterDefaultValue,
  setParameterFilteringParameters,
  setParameterIsMultiSelect,
  setParameterName,
  setParameterQueryType,
  setParameterRequired,
  setParameterSourceConfig,
  setParameterSourceType,
  setParameterTemporalUnits,
  setParameterType,
  setSharing,
  setSidebar,
  showAddParameterPopover,
  toggleSidebar,
  updateDashboardAndCards,
} from "metabase/dashboard/actions";
import { useRefreshDashboard } from "metabase/dashboard/hooks";
import type {
  CancelledFetchDashboardResult,
  FetchDashboardResult,
  RefreshPeriod,
  SuccessfulFetchDashboardResult,
} from "metabase/dashboard/types";
import { useLoadingTimer } from "metabase/hooks/use-loading-timer";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { useWebNotification } from "metabase/hooks/use-web-notification";
import { parseHashOptions } from "metabase/lib/browser";
import { connect, useDispatch } from "metabase/lib/redux";
import { closeNavbar, setErrorPage } from "metabase/redux/app";
import { addUndo, dismissAllUndo, dismissUndo } from "metabase/redux/undo";
import { getIsNavbarOpen } from "metabase/selectors/app";
import {
  canManageSubscriptions,
  getUserIsAdmin,
} from "metabase/selectors/user";
import { saveDashboardPdf } from "metabase/visualizations/lib/save-dashboard-pdf";
import type {
  DashboardCard,
  DashboardId,
  Dashboard as IDashboard,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";
import type { State } from "metabase-types/store";

import { DASHBOARD_SLOW_TIMEOUT, SIDEBAR_NAME } from "./constants";
import {
  getCanResetFilters,
  getClickBehaviorSidebarDashcard,
  getDashboardBeforeEditing,
  getDashboardComplete,
  getDocumentTitle,
  getFavicon,
  getIsAddParameterPopoverOpen,
  getIsAdditionalInfoVisible,
  getIsDashCardsLoadingComplete,
  getIsDashCardsRunning,
  getIsDirty,
  getIsEditing,
  getIsEditingParameter,
  getIsHeaderVisible,
  getIsNavigatingBackToDashboard,
  getIsSharing,
  getLoadingStartTime,
  getMissingRequiredParameters,
  getParameterValues,
  getSelectedTabId,
  getSidebar,
  getSlowCards,
} from "./selectors";

// Utility functions
function isSuccessfulFetchDashboardResult(
  result: FetchDashboardResult,
): result is SuccessfulFetchDashboardResult {
  const hasError = "error" in result;
  return !hasError;
}

function isCancelledFetchDashboardResult(
  result: FetchDashboardResult,
): result is CancelledFetchDashboardResult {
  return isObject(result.payload) && Boolean(result.payload.isCancelled);
}

const mapStateToProps = (state: State) => {
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
    slowCards: getSlowCards(state),
    parameterValues: getParameterValues(state),
    loadingStartTime: getLoadingStartTime(state),
    clickBehaviorSidebarDashcard: getClickBehaviorSidebarDashcard(state),
    isAddParameterPopoverOpen: getIsAddParameterPopoverOpen(state),
    sidebar: getSidebar(state),
    pageFavicon: getFavicon(state),
    documentTitle: getDocumentTitle(state),
    isRunning: getIsDashCardsRunning(state),
    isLoadingComplete: getIsDashCardsLoadingComplete(state),
    isHeaderVisible: getIsHeaderVisible(state),
    isAdditionalInfoVisible: getIsAdditionalInfoVisible(state),
    selectedTabId: getSelectedTabId(state),
    isNavigatingBackToDashboard: getIsNavigatingBackToDashboard(state),
    missingRequiredParameters: getMissingRequiredParameters(state),
    canResetFilters: getCanResetFilters(state),
  };
};

const mapDispatchToProps = {
  initialize,
  cancelFetchDashboardCardData,
  addCardToDashboard,
  addHeadingDashCardToDashboard,
  addMarkdownDashCardToDashboard,
  addLinkDashCardToDashboard,
  setEditingDashboard,
  setDashboardAttributes,
  setSharing,
  toggleSidebar,
  closeSidebar,
  closeNavbar,
  setErrorPage,
  setParameterName,
  setParameterType,
  navigateToNewCardFromDashboard,
  setParameterDefaultValue,
  setParameterRequired,
  setParameterTemporalUnits,
  setParameterIsMultiSelect,
  setParameterQueryType,
  setParameterSourceType,
  setParameterSourceConfig,
  setParameterFilteringParameters,
  showAddParameterPopover,
  removeParameter,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardVisualizationSettings,
  onUpdateDashCardColumnSettings,
  updateDashboardAndCards,
  setSidebar,
  hideAddParameterPopover,
  fetchDashboard,
  fetchDashboardCardData,
  onChangeLocation: push,
  addParameter,
  addIFrameDashCardToDashboard,
  addActionToDashboard,
  addSectionToDashboard,
  resetParameters,
  applyDraftParameterValues,
};

const connector = connect(mapStateToProps, mapDispatchToProps);
type ReduxProps = ConnectedProps<typeof connector>;

type DashboardSharedProps = Omit<ReduxProps, "onChangeLocation"> & {
  parameterQueryParams: Query;

  isFullscreen: boolean;
  isNightMode: boolean;
  hasNightModeToggle: boolean;
  refreshPeriod: number | null;

  onNightModeChange: (isNightMode: boolean) => void;
  onFullscreenChange: (isFullscreen: boolean, setUrl?: boolean) => void;
  setRefreshElapsedHook: (hook: (newPeriod: RefreshPeriod) => void) => void;
  onRefreshPeriodChange: (period: number | null) => void;

  autoScrollToDashcardId: number | undefined;
  reportAutoScrolledToDashcard: () => void;

  downloadsEnabled: boolean;
  noLoaderWrapper: boolean;
};

type DashboardContextType = DashboardSharedProps & {
  isInitialized: boolean;
  error: unknown;
  currentTabDashcards: DashboardCard[];
  tabHasCards: boolean;
  dashboardHasCards: boolean | null;
  canWrite: boolean;
  canRestore: boolean;
  canDelete: boolean;
  shouldRenderAsNightMode: boolean;
  addCardOnLoad?: number;
  editingOnLoad?: string | string[] | boolean;
  elapsed: number | null;

  setElapsed: (elapsed: number | null) => void;

  handleSetEditing: (dashboard: IDashboard | null) => void;
  handleAddQuestion: () => void;
  refreshDashboard: () => void;
  dismissAllUndo: () => void;
  canResetFilters?: boolean;
  onResetFilters?: () => void;
  openSettingsSidebar?: () => void;

  saveDashboardPdf?: (selector: string, filename: string) => void;
};

type OwnProps = {
  children: React.ReactNode;
  dashboardId: DashboardId;

  downloadsEnabled?: boolean;
  noLoaderWrapper?: boolean;

  isFullscreen: boolean;
  isNightMode: boolean;
  hasNightModeToggle: boolean;
  refreshPeriod: number | null;

  onNightModeChange: (isNightMode: boolean) => void;
  onFullscreenChange: (isFullscreen: boolean, setUrl?: boolean) => void;
  setRefreshElapsedHook: (hook: (newPeriod: RefreshPeriod) => void) => void;
  onRefreshPeriodChange: (period: number | null) => void;

  autoScrollToDashcardId: number | undefined;
  reportAutoScrolledToDashcard: () => void;
};

type ContextProviderProps = DashboardSharedProps & OwnProps;

const DashboardContext = createContext<DashboardContextType | undefined>(
  undefined,
);

function BaseDashboardContextProvider({
  children,
  dashboardId,
  downloadsEnabled = true,
  noLoaderWrapper = false,

  hasNightModeToggle,
  isFullscreen,
  isNightMode,
  onNightModeChange,
  refreshPeriod,
  onFullscreenChange,
  setRefreshElapsedHook,
  onRefreshPeriodChange,
  autoScrollToDashcardId,
  reportAutoScrolledToDashcard,
  dashboard,
  isEditing,
  isSharing,
  dashboardBeforeEditing,
  isEditingParameter,
  isDirty,
  slowCards,
  parameterValues,
  loadingStartTime,
  clickBehaviorSidebarDashcard,
  isAddParameterPopoverOpen,
  sidebar,
  isHeaderVisible,
  isAdditionalInfoVisible,
  selectedTabId,
  isNavigatingBackToDashboard,
  canManageSubscriptions,
  isAdmin,
  isNavbarOpen,
  parameterQueryParams,
  initialize,
  cancelFetchDashboardCardData,
  addCardToDashboard,
  addHeadingDashCardToDashboard,
  addMarkdownDashCardToDashboard,
  addLinkDashCardToDashboard,
  setEditingDashboard,
  setDashboardAttributes,
  setSharing,
  toggleSidebar,
  closeSidebar,
  closeNavbar,
  setErrorPage,
  addParameter,
  setParameterName,
  setParameterType,
  navigateToNewCardFromDashboard,
  setParameterDefaultValue,
  setParameterRequired,
  setParameterTemporalUnits,
  setParameterIsMultiSelect,
  setParameterQueryType,
  setParameterSourceType,
  setParameterSourceConfig,
  setParameterFilteringParameters,
  showAddParameterPopover,
  removeParameter,
  onReplaceAllDashCardVisualizationSettings,
  onUpdateDashCardVisualizationSettings,
  onUpdateDashCardColumnSettings,
  updateDashboardAndCards,
  setSidebar,
  hideAddParameterPopover,
  fetchDashboard,
  fetchDashboardCardData,
  documentTitle,
  pageFavicon,
  isRunning,
  isLoadingComplete,
  missingRequiredParameters = [],
  addIFrameDashCardToDashboard,
  addActionToDashboard,
  addSectionToDashboard,
  canResetFilters,
  applyDraftParameterValues,
  resetParameters,
}: ContextProviderProps) {
  const dispatch = useDispatch();
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const options = parseHashOptions(window.location.hash);
  const editingOnLoad = options.edit;
  const addCardOnLoad = options.add != null ? Number(options.add) : undefined;

  const { requestPermission, showNotification } = useWebNotification();

  // Dashboard component logic
  const currentTabDashcards = useMemo(() => {
    if (!dashboard || !Array.isArray(dashboard.dashcards)) {
      return [];
    }
    if (!selectedTabId) {
      return dashboard.dashcards;
    }
    return dashboard.dashcards.filter(
      (dc: DashboardCard) => dc.dashboard_tab_id === selectedTabId,
    );
  }, [dashboard, selectedTabId]);

  const tabHasCards = currentTabDashcards.length > 0;
  const dashboardHasCards = dashboard && dashboard.dashcards.length > 0;

  // Dashboard component variables
  const canWrite = Boolean(dashboard?.can_write);
  const canRestore = Boolean(dashboard?.can_restore);
  const canDelete = Boolean(dashboard?.can_delete);

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId: dashboardId,
    parameterQueryParams,
  });

  const onResetFilters = useCallback(async () => {
    await resetParameters();
    await applyDraftParameterValues();
  }, [applyDraftParameterValues, resetParameters]);

  const openSettingsSidebar = useCallback(() => {
    setSidebar({ name: SIDEBAR_NAME.settings });
  }, [setSidebar]);

  const shouldRenderAsNightMode = isNightMode && isFullscreen;

  useUnmount(() => {
    dispatch(reset());
    dispatch(closeDashboard());
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
      dispatch(dismissUndo({ undoId: slowToastId }));
    };
  }, [
    dashboard?.name,
    isLoadingComplete,
    dispatch,
    showNotification,
    slowToastId,
  ]);

  const onConfirmToast = useCallback(async () => {
    await requestPermission();
    dispatch(dismissUndo({ undoId: slowToastId }));
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

  useLoadingTimer(Boolean(isRunning), {
    timer: DASHBOARD_SLOW_TIMEOUT,
    onTimeout,
  });

  const previousDashboard = usePrevious(dashboard);
  const previousDashboardId = usePrevious(dashboardId);
  const previousTabId = usePrevious(selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);

  // Dashboard component handlers
  const handleSetEditing = useCallback(
    (dashboard: IDashboard | null) => {
      if (!isEditing) {
        onRefreshPeriodChange(null);
        setEditingDashboard(dashboard);
      }
    },
    [isEditing, onRefreshPeriodChange, setEditingDashboard],
  );

  const handleAddQuestion = useCallback(() => {
    handleSetEditing(dashboard);
    toggleSidebar(SIDEBAR_NAME.addQuestion);
  }, [handleSetEditing, dashboard, toggleSidebar]);

  const handleLoadDashboard = useCallback(
    async (dashboardId: DashboardId) => {
      initialize({ clearCache: !isNavigatingBackToDashboard });

      const result = await fetchDashboard({
        dashId: dashboardId,
        queryParams: parameterQueryParams,
        options: {
          clearCache: !isNavigatingBackToDashboard,
          preserveParameters: isNavigatingBackToDashboard,
        },
      });

      if (!isSuccessfulFetchDashboardResult(result)) {
        if (!isCancelledFetchDashboardResult(result)) {
          setErrorPage(result.payload);
        }
        return;
      }

      try {
        const dashboard = result.payload.dashboard;

        if (editingOnLoad) {
          onRefreshPeriodChange(null);
          setEditingDashboard(dashboard);
        }
        if (addCardOnLoad != null) {
          const searchParams = new URLSearchParams(window.location.search);
          const tabParam = searchParams.get("tab");
          const tabId = tabParam ? parseInt(tabParam, 10) : null;

          addCardToDashboard({
            dashId: dashboardId,
            cardId: addCardOnLoad,
            tabId,
          });
        }
      } catch (error) {
        if (error instanceof Response && error.status === 404) {
          setErrorPage({ ...error, context: "dashboard" });
        } else {
          console.error(error);
          setError(error);
        }
      }
    },
    [
      addCardOnLoad,
      addCardToDashboard,
      editingOnLoad,
      fetchDashboard,
      initialize,
      isNavigatingBackToDashboard,
      onRefreshPeriodChange,
      parameterQueryParams,
      setEditingDashboard,
      setErrorPage,
    ],
  );

  useEffect(() => {
    const hasDashboardChanged = dashboardId !== previousDashboardId;
    if (hasDashboardChanged) {
      handleLoadDashboard(dashboardId).then(() => setIsInitialized(true));
      return;
    }

    if (!dashboard) {
      return;
    }

    const hasDashboardLoaded = !previousDashboard;
    const hasTabChanged = selectedTabId !== previousTabId;
    const hasParameterValueChanged = !_.isEqual(
      parameterValues,
      previousParameterValues,
    );

    if (hasDashboardLoaded) {
      fetchDashboardCardData({ reload: false, clearCache: true });
    } else if (hasTabChanged || hasParameterValueChanged) {
      fetchDashboardCardData();
    }
  }, [
    dashboard,
    dashboardId,
    fetchDashboardCardData,
    handleLoadDashboard,
    isInitialized,
    parameterValues,
    previousDashboard,
    previousDashboardId,
    previousParameterValues,
    previousTabId,
    selectedTabId,
  ]);

  useUnmount(() => {
    cancelFetchDashboardCardData();
  });

  // Helper for dismissing all undo toasts
  const handleDismissAllUndo = useCallback(() => {
    dispatch(dismissAllUndo());
  }, [dispatch]);

  const [elapsed, setElapsed] = useState<number | null>(null);

  if (setRefreshElapsedHook) {
    setRefreshElapsedHook((elapsed: number | null) => {
      setElapsed(elapsed);
    });
  }
  // Create the context value object with all the state and handlers
  const contextValue = useMemo(
    () => ({
      // Pass through shared props
      dashboard,
      dashboardId,
      isEditing,
      isSharing,
      dashboardBeforeEditing,
      isEditingParameter,
      isDirty,
      slowCards,
      parameterValues,
      loadingStartTime,
      clickBehaviorSidebarDashcard,
      isAddParameterPopoverOpen,
      sidebar,
      isHeaderVisible,
      isAdditionalInfoVisible,
      selectedTabId,
      isNavigatingBackToDashboard,
      canManageSubscriptions,
      isAdmin,
      isNavbarOpen,
      parameterQueryParams,
      initialize,
      cancelFetchDashboardCardData,
      addCardToDashboard,
      addHeadingDashCardToDashboard,
      addMarkdownDashCardToDashboard,
      addLinkDashCardToDashboard,
      setEditingDashboard,
      setDashboardAttributes,
      setSharing,
      toggleSidebar,
      closeSidebar,
      closeNavbar,
      setErrorPage,
      addParameter,
      setParameterName,
      setParameterType,
      navigateToNewCardFromDashboard,
      setParameterDefaultValue,
      setParameterRequired,
      setParameterTemporalUnits,
      setParameterIsMultiSelect,
      setParameterQueryType,
      setParameterSourceType,
      setParameterSourceConfig,
      setParameterFilteringParameters,
      showAddParameterPopover,
      removeParameter,
      onReplaceAllDashCardVisualizationSettings,
      onUpdateDashCardVisualizationSettings,
      onUpdateDashCardColumnSettings,
      updateDashboardAndCards,
      setSidebar,
      hideAddParameterPopover,
      fetchDashboard,
      fetchDashboardCardData,

      // State
      isInitialized,
      error,
      currentTabDashcards,
      tabHasCards,
      dashboardHasCards,
      canWrite,
      canRestore,
      canDelete,
      shouldRenderAsNightMode,
      addCardOnLoad,
      editingOnLoad,
      autoScrollToDashcardId,
      missingRequiredParameters,

      // Dashboard props specific to context
      isFullscreen,
      isNightMode,
      hasNightModeToggle,
      refreshPeriod,
      downloadsEnabled,
      noLoaderWrapper,

      // Display controls
      onNightModeChange,
      onFullscreenChange,
      setRefreshElapsedHook,
      onRefreshPeriodChange,

      // Functions
      handleSetEditing,
      handleAddQuestion,
      refreshDashboard,
      reportAutoScrolledToDashcard,
      dismissAllUndo: handleDismissAllUndo,
      canResetFilters,
      onResetFilters,
      openSettingsSidebar,
      saveDashboardPdf,

      elapsed,
      setElapsed,

      addIFrameDashCardToDashboard,
      addActionToDashboard,
      addSectionToDashboard,

      isLoadingComplete,
      isRunning,

      resetParameters,
      applyDraftParameterValues,
      pageFavicon,
      documentTitle,
    }),
    [
      dashboard,
      dashboardId,
      isEditing,
      isSharing,
      dashboardBeforeEditing,
      isEditingParameter,
      isDirty,
      slowCards,
      parameterValues,
      loadingStartTime,
      clickBehaviorSidebarDashcard,
      isAddParameterPopoverOpen,
      sidebar,
      isHeaderVisible,
      isAdditionalInfoVisible,
      selectedTabId,
      isNavigatingBackToDashboard,
      canManageSubscriptions,
      isAdmin,
      isNavbarOpen,
      parameterQueryParams,
      initialize,
      cancelFetchDashboardCardData,
      addCardToDashboard,
      addHeadingDashCardToDashboard,
      addMarkdownDashCardToDashboard,
      addLinkDashCardToDashboard,
      setEditingDashboard,
      setDashboardAttributes,
      setSharing,
      toggleSidebar,
      closeSidebar,
      closeNavbar,
      setErrorPage,
      addParameter,
      setParameterName,
      setParameterType,
      navigateToNewCardFromDashboard,
      setParameterDefaultValue,
      setParameterRequired,
      setParameterTemporalUnits,
      setParameterIsMultiSelect,
      setParameterQueryType,
      setParameterSourceType,
      setParameterSourceConfig,
      setParameterFilteringParameters,
      showAddParameterPopover,
      removeParameter,
      onReplaceAllDashCardVisualizationSettings,
      onUpdateDashCardVisualizationSettings,
      onUpdateDashCardColumnSettings,
      updateDashboardAndCards,
      setSidebar,
      hideAddParameterPopover,
      fetchDashboard,
      fetchDashboardCardData,
      isInitialized,
      error,
      currentTabDashcards,
      tabHasCards,
      dashboardHasCards,
      canWrite,
      canRestore,
      canDelete,
      shouldRenderAsNightMode,
      addCardOnLoad,
      editingOnLoad,
      autoScrollToDashcardId,
      missingRequiredParameters,
      isFullscreen,
      isNightMode,
      hasNightModeToggle,
      refreshPeriod,
      downloadsEnabled,
      noLoaderWrapper,
      onNightModeChange,
      onFullscreenChange,
      setRefreshElapsedHook,
      onRefreshPeriodChange,
      handleSetEditing,
      handleAddQuestion,
      refreshDashboard,
      reportAutoScrolledToDashcard,
      handleDismissAllUndo,
      canResetFilters,
      onResetFilters,
      openSettingsSidebar,
      elapsed,
      addIFrameDashCardToDashboard,
      addActionToDashboard,
      addSectionToDashboard,
      isLoadingComplete,
      isRunning,
      resetParameters,
      applyDraftParameterValues,

      pageFavicon,
      documentTitle,
    ],
  );

  return (
    <DashboardContext.Provider value={contextValue}>
      {children}
    </DashboardContext.Provider>
  );
}

export const DashboardContextProvider = connector(BaseDashboardContextProvider);

// Create a custom hook to use the dashboard context
export function useDashboardContext() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error(
      "useDashboardContext must be used within a DashboardContextProvider",
    );
  }
  return context;
}
