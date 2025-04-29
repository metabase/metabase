import type { Query } from "history";
import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePrevious, useUnmount } from "react-use";
import { isEqual, isObject, noop } from "underscore";

import { useDispatch } from "metabase/lib/redux";
import type { Dashboard, DashboardId } from "metabase-types/api";

import { navigateToNewCardFromDashboard } from "../actions";
import type { NavigateToNewCardFromDashboardOpts } from "../components/DashCard/types";
import type { UseAutoScrollToDashcardResult } from "../hooks/use-auto-scroll-to-dashcard";
import type {
  CancelledFetchDashboardResult,
  DashboardFullscreenControls,
  DashboardRefreshPeriodControls,
  EmbedDisplayParams,
  EmbedThemeControls,
  FailedFetchDashboardResult,
  FetchDashboardResult,
  SuccessfulFetchDashboardResult,
} from "../types";

import { type ReduxProps, connector } from "./context.redux";

type DashboardLoadingState = {
  isLoading: boolean;
};

type OwnProps = {
  dashboardId: DashboardId;
  parameterQueryParams?: Query;
  onLoad?: (dashboard: Dashboard) => void;
  onError?: (error: FailedFetchDashboardResult) => void;
  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
};

type OwnResult = {
  shouldRenderAsNightMode: boolean;
};

type DashboardControls = DashboardFullscreenControls &
  DashboardRefreshPeriodControls &
  UseAutoScrollToDashcardResult &
  EmbedDisplayParams &
  EmbedThemeControls;

type ContextProps = OwnProps & ReduxProps & Partial<DashboardControls>;

type ContextReturned = OwnResult &
  OwnProps &
  ReduxProps &
  Required<DashboardControls> &
  DashboardLoadingState;

const DashboardContext = createContext<ContextReturned | undefined>(undefined);

const DashboardContextProviderInner = ({
  dashboardId,
  parameterQueryParams = {},
  onLoad,
  onError,

  children,

  // url params
  isFullscreen = false,
  onFullscreenChange = noop,
  hasNightModeToggle = false,
  onNightModeChange = noop,
  isNightMode = false,
  refreshPeriod = null,
  setRefreshElapsedHook = noop,
  onRefreshPeriodChange = noop,
  background = true,
  bordered = true,
  titled = true,
  font = null,
  theme = "light",
  setTheme = noop,
  hideParameters = null,
  downloadsEnabled = { pdf: true, results: true },
  autoScrollToDashcardId = undefined,
  reportAutoScrolledToDashcard = noop,
  cardTitled = true,
  getClickActionMode = undefined,
  withFooter = true,

  // redux selectors
  dashboard,
  selectedTabId,
  isEditing,
  isNavigatingBackToDashboard,
  parameterValues,

  // redux actions
  addCardToDashboard,
  cancelFetchDashboardCardData,
  fetchDashboard,
  fetchDashboardCardData,
  initialize,
  setEditingDashboard,
  toggleSidebar,
  reset,
  closeDashboard,
  navigateToNewCardFromDashboard: _navigateToNewCardFromDashboard,
  ...reduxProps
}: PropsWithChildren<ContextProps>) => {
  const dispatch = useDispatch();

  const [isInitialized, setIsInitialized] = useState(false);

  const previousDashboard = usePrevious(dashboard);
  const previousDashboardId = usePrevious(dashboardId);
  const previousTabId = usePrevious(selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);

  const shouldRenderAsNightMode = Boolean(isNightMode && isFullscreen);

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

      if (isSuccessfulFetchDashboardResult(result)) {
        onLoad?.(result.payload.dashboard);
      } else if (
        isFailedFetchDashboardResult(result) &&
        !isCancelledFetchDashboardResult(result)
      ) {
        onError?.(result);
      }
    },
    [
      fetchDashboard,
      initialize,
      isNavigatingBackToDashboard,
      onError,
      onLoad,
      parameterQueryParams,
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
    const hasParameterValueChanged = !isEqual(
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

  useUnmount(() => {
    reset();
    closeDashboard();
  });

  return (
    <DashboardContext.Provider
      value={{
        dashboardId,
        parameterQueryParams,
        onLoad,
        onError,

        navigateToNewCardFromDashboard:
          _navigateToNewCardFromDashboard ??
          ((opts: NavigateToNewCardFromDashboardOpts) =>
            dispatch(navigateToNewCardFromDashboard(opts))),

        isLoading: !dashboard,

        isFullscreen,
        onFullscreenChange,
        hasNightModeToggle,
        onNightModeChange,
        isNightMode,
        shouldRenderAsNightMode,
        refreshPeriod,
        setRefreshElapsedHook,
        onRefreshPeriodChange,
        background,
        bordered,
        titled,
        font,
        theme,
        setTheme,
        hideParameters,
        downloadsEnabled,
        autoScrollToDashcardId,
        reportAutoScrolledToDashcard,
        cardTitled,
        getClickActionMode,
        withFooter,

        // redux selectors
        dashboard,
        selectedTabId,
        isEditing,
        isNavigatingBackToDashboard,
        parameterValues,

        // redux actions
        addCardToDashboard,
        cancelFetchDashboardCardData,
        fetchDashboard,
        fetchDashboardCardData,
        initialize,
        setEditingDashboard,
        toggleSidebar,
        reset,
        closeDashboard,
        ...reduxProps,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const DashboardContextProvider = connector(
  DashboardContextProviderInner,
);

export function useDashboardContext() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error(
      "useDashboardContext must be used within a DashboardContextProvider",
    );
  }
  return context;
}

function isSuccessfulFetchDashboardResult(
  result: FetchDashboardResult,
): result is SuccessfulFetchDashboardResult {
  const hasError = "error" in result;
  return !hasError;
}

export function isFailedFetchDashboardResult(
  result: FetchDashboardResult,
): result is FailedFetchDashboardResult {
  return isObject(result.payload) && "error" in result;
}

export function isCancelledFetchDashboardResult(
  result: FetchDashboardResult,
): result is CancelledFetchDashboardResult {
  return isObject(result.payload) && Boolean(result.payload.isCancelled);
}
