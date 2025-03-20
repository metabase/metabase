import type { Location } from "history";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePrevious, useUnmount } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { closeDashboard, reset } from "metabase/dashboard/actions";
import {
  useDashboardUrlParams,
  useRefreshDashboard,
} from "metabase/dashboard/hooks";
import type { SectionLayout } from "metabase/dashboard/sections";
import type {
  CancelledFetchDashboardResult,
  FetchDashboardResult,
  SuccessfulFetchDashboardResult,
} from "metabase/dashboard/types";
import { useLoadingTimer } from "metabase/hooks/use-loading-timer";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { useWebNotification } from "metabase/hooks/use-web-notification";
import { parseHashOptions } from "metabase/lib/browser";
import { useDispatch } from "metabase/lib/redux";
import type { ParameterMappingOption } from "metabase/parameters/utils/mapping-options";
import { addUndo, dismissAllUndo, dismissUndo } from "metabase/redux/undo";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  CardId,
  DashCardId,
  DashCardVisualizationSettings,
  DashboardCard,
  DashboardId,
  DashboardTabId,
  Dashboard as IDashboard,
  ParameterId,
  ParameterValueOrArray,
  TemporalUnit,
  ValuesQueryType,
  ValuesSourceConfig,
  ValuesSourceType,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";
import type {
  DashboardSidebarName,
  SelectedTabId,
  State,
} from "metabase-types/store";

import { DASHBOARD_SLOW_TIMEOUT, SIDEBAR_NAME } from "./constants";

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

// Define a base type with common properties for both context and props
type DashboardSharedProps = {
  // Dashboard props
  dashboard: IDashboard | null;
  dashboardId: DashboardId;
  isEditing: boolean;
  isSharing: boolean;
  dashboardBeforeEditing: IDashboard | null;
  isEditingParameter: boolean;
  isDirty: boolean;
  slowCards: Record<DashCardId, boolean>;
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  loadingStartTime: number | null;
  clickBehaviorSidebarDashcard: DashboardCard | null;
  isAddParameterPopoverOpen: boolean;
  sidebar: State["dashboard"]["sidebar"];
  isHeaderVisible: boolean;
  isAdditionalInfoVisible: boolean;
  selectedTabId: SelectedTabId;
  isNavigatingBackToDashboard: boolean;
  canManageSubscriptions: boolean;
  isAdmin: boolean;
  isNavbarOpen: boolean;
  parameterQueryParams: any;

  // Action functions
  initialize: (opts?: { clearCache?: boolean }) => void;
  cancelFetchDashboardCardData: () => void;
  addCardToDashboard: (opts: {
    dashId: DashboardId;
    cardId: CardId;
    tabId: DashboardTabId | null;
  }) => void;
  addHeadingDashCardToDashboard: (opts: any) => void;
  addMarkdownDashCardToDashboard: (opts: any) => void;
  addLinkDashCardToDashboard: (opts: any) => void;
  setEditingDashboard: (dashboard: IDashboard | null) => void;
  setDashboardAttributes: (opts: any) => void;
  setSharing: (isSharing: boolean) => void;
  toggleSidebar: (sidebarName: DashboardSidebarName) => void;
  closeSidebar: () => void;
  closeNavbar: () => void;
  setErrorPage: (error: unknown) => void;
  setParameterName: (id: ParameterId, name: string) => void;
  setParameterType: (id: ParameterId, type: string, sectionId: string) => void;
  navigateToNewCardFromDashboard: (opts: any) => void;
  setParameterDefaultValue: (id: ParameterId, value: unknown) => void;
  setParameterRequired: (id: ParameterId, value: boolean) => void;
  setParameterTemporalUnits: (
    id: ParameterId,
    temporalUnits: TemporalUnit[],
  ) => void;
  setParameterIsMultiSelect: (id: ParameterId, isMultiSelect: boolean) => void;
  setParameterQueryType: (id: ParameterId, queryType: ValuesQueryType) => void;
  setParameterSourceType: (
    id: ParameterId,
    sourceType: ValuesSourceType,
  ) => void;
  setParameterSourceConfig: (
    id: ParameterId,
    config: ValuesSourceConfig,
  ) => void;
  setParameterFilteringParameters: (
    parameterId: ParameterId,
    filteringParameters: ParameterId[],
  ) => void;
  showAddParameterPopover: () => void;
  removeParameter: (id: ParameterId) => void;
  onReplaceAllDashCardVisualizationSettings: (
    id: DashCardId,
    settings: DashCardVisualizationSettings | null | undefined,
  ) => void;
  onUpdateDashCardVisualizationSettings: (
    id: DashCardId,
    settings: DashCardVisualizationSettings | null | undefined,
  ) => void;
  onUpdateDashCardColumnSettings: (
    id: DashCardId,
    columnKey: string,
    settings?: Record<string, unknown> | null,
  ) => void;
  updateDashboardAndCards: () => void;
  setSidebar: (opts: { name: DashboardSidebarName }) => void;
  hideAddParameterPopover: () => void;
  fetchDashboard: (opts: {
    dashId: DashboardId;
    queryParams: any;
    options?: {
      clearCache?: boolean;
      preserveParameters?: boolean;
    };
  }) => Promise<FetchDashboardResult>;
  fetchDashboardCardData: (opts?: {
    isRefreshing?: boolean;
    reload?: boolean;
    clearCache?: boolean;
  }) => void;
  addParameter: (options: ParameterMappingOption) => any;
};

// Define the context type
type DashboardContextType = DashboardSharedProps & {
  // State
  isInitialized: boolean;
  error: unknown;
  currentTabDashcards: DashboardCard[];
  tabHasCards: boolean;
  dashboardHasCards: boolean;
  canWrite: boolean;
  canRestore: boolean;
  canDelete: boolean;
  shouldRenderAsNightMode: boolean;
  addCardOnLoad?: number;
  editingOnLoad?: string | string[] | boolean;
  autoScrollToDashcardId: number | undefined;
  missingRequiredParameters: UiParameter[];

  // Dashboard props (already extended from DashboardSharedProps)
  isFullscreen: boolean;
  isNightMode: boolean;
  hasNightModeToggle: boolean;
  refreshPeriod: number | null;
  elapsed: number | null;
  downloadsEnabled: boolean;
  noLoaderWrapper: boolean;

  // Display controls
  onNightModeChange: (isNightMode: boolean) => void;
  onFullscreenChange: (isFullscreen: boolean, setUrl?: boolean) => void;
  setRefreshElapsedHook: (hook: (() => void) | null) => void;
  setElapsed: (elapsed: number | null) => void;
  onRefreshPeriodChange: (period: number | null) => void;

  // Functions
  handleSetEditing: (dashboard: IDashboard | null) => void;
  handleAddQuestion: () => void;
  refreshDashboard: () => void;
  reportAutoScrolledToDashcard: () => void;
  dismissAllUndo: () => void;
  canResetFilters?: boolean;
  onResetFilters?: () => void;
  openSettingsSidebar?: () => void;

  // Additional functions
  addIFrameDashCardToDashboard: (opts: any) => void;
  addActionToDashboard: (opts: any) => void;
  addSectionToDashboard: (opts: {
    dashId: DashboardId;
    tabId: DashboardTabId | null;
    sectionLayout: SectionLayout;
  }) => void;

  // PDF Export
  saveDashboardPdf?: (selector: string, filename: string) => void;
};

// Create props type extending the base type
type ContextProviderProps = DashboardSharedProps & {
  children: React.ReactNode;
  location: Location;
  isRunning: boolean;
  isLoadingComplete: boolean;

  // Optional additional props
  missingRequiredParameters?: UiParameter[];
  addIFrameDashCardToDashboard?: (opts: any) => void;
  addActionToDashboard?: (opts: any) => void;
  addSectionToDashboard?: (opts: any) => void;
  saveDashboardPdf?: (selector: string, filename: string) => void;
  canResetFilters?: boolean;
  onResetFilters?: () => void;
  openSettingsSidebar?: () => void;
  downloadsEnabled?: boolean;
  noLoaderWrapper?: boolean;
};

// Create the context with a default value
const DashboardContext = createContext<DashboardContextType | undefined>(
  undefined,
);

// Create a provider component
export function DashboardContextProvider({
  children,
  // Props from shared props
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

  // Additional props not in shared props
  location,
  isRunning,
  isLoadingComplete,
  missingRequiredParameters = [],
  addIFrameDashCardToDashboard,
  addActionToDashboard,
  addSectionToDashboard,
  saveDashboardPdf,
  canResetFilters,
  onResetFilters,
  openSettingsSidebar,
  downloadsEnabled = true,
  noLoaderWrapper = false,
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

  const {
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
  } = useDashboardUrlParams({ location, onRefresh: refreshDashboard });

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

  // Create safe versions of optional functions
  const safeAddIFrameDashCardToDashboard = useCallback(
    (opts: any) => {
      if (addIFrameDashCardToDashboard) {
        addIFrameDashCardToDashboard(opts);
      } else {
        console.warn("addIFrameDashCardToDashboard not provided");
      }
    },
    [addIFrameDashCardToDashboard],
  );

  const safeAddActionToDashboard = useCallback(
    (opts: any) => {
      if (addActionToDashboard) {
        addActionToDashboard(opts);
      } else {
        console.warn("addActionToDashboard not provided");
      }
    },
    [addActionToDashboard],
  );

  const safeAddSectionToDashboard = useCallback(
    (opts: any) => {
      if (addSectionToDashboard) {
        addSectionToDashboard(opts);
      } else {
        console.warn("addSectionToDashboard not provided");
      }
    },
    [addSectionToDashboard],
  );

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

      // Additional functions with safe defaults
      addIFrameDashCardToDashboard: safeAddIFrameDashCardToDashboard,
      addActionToDashboard: safeAddActionToDashboard,
      addSectionToDashboard: safeAddSectionToDashboard,
    }),
    [
      // Shared props dependencies
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

      // Context-specific dependencies
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
      saveDashboardPdf,
      safeAddIFrameDashCardToDashboard,
      safeAddActionToDashboard,
      safeAddSectionToDashboard,
      elapsed,
      setElapsed,
    ],
  );

  return (
    <DashboardContext.Provider value={contextValue}>
      {children}
    </DashboardContext.Provider>
  );
}

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
