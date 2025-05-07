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

import type { Dashboard, DashboardId } from "metabase-types/api";

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

export type DashboardContextLoadingState = {
  isLoading: boolean;
};

export type DashboardContextErrorState = {
  error: FailedFetchDashboardResult | Error | null;
};

export type DashboardContextOwnProps = {
  dashboardId: DashboardId;
  parameterQueryParams?: Query;
  onLoad?: (dashboard: Dashboard) => void;
  onError?: (error: FailedFetchDashboardResult | Error) => void;
  onLoadWithoutCards?: (dashboard: Dashboard) => void;
  navigateToNewCardFromDashboard:
    | ((opts: NavigateToNewCardFromDashboardOpts) => void)
    | null;
};

export type DashboardContextOwnResult = {
  shouldRenderAsNightMode: boolean;
};

export type DashboardControls = DashboardFullscreenControls &
  DashboardRefreshPeriodControls &
  UseAutoScrollToDashcardResult &
  EmbedDisplayParams &
  EmbedThemeControls;

export type DashboardContextProps = PropsWithChildren<
  DashboardContextOwnProps & Partial<DashboardControls>
>;

type ContextProps = DashboardContextProps & ReduxProps;

type DashboardContextReturned = DashboardContextOwnResult &
  DashboardContextOwnProps &
  ReduxProps &
  Required<DashboardControls> &
  DashboardContextLoadingState &
  DashboardContextErrorState;

export const DashboardContext = createContext<
  DashboardContextReturned | undefined
>(undefined);

const DashboardContextProviderInner = ({
  dashboardId,
  parameterQueryParams = {},
  onLoad,
  onLoadWithoutCards,
  onError,
  navigateToNewCardFromDashboard,
  children,
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
  dashboard,
  selectedTabId,
  isEditing,
  isNavigatingBackToDashboard,
  parameterValues,

  // redux actions
  cancelFetchDashboardCardData,
  fetchDashboard,
  fetchDashboardCardData,
  initialize,
  reset,
  closeDashboard,
  ...reduxProps
}: ContextProps) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FailedFetchDashboardResult | Error | null>(
    null,
  );

  const previousDashboardId = usePrevious(dashboardId);
  const previousSelectedTabId = usePrevious(selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);

  const shouldRenderAsNightMode = Boolean(isNightMode && isFullscreen);

  const handleLoadDashboard = useCallback(async () => {
    initialize({ clearCache: !isNavigatingBackToDashboard });
    const dashboardResult = await fetchDashboard({
      dashId: dashboardId,
      queryParams: parameterQueryParams,
      options: {
        clearCache: !isNavigatingBackToDashboard,
        preserveParameters: isNavigatingBackToDashboard,
      },
    });

    if (isSuccessfulFetchDashboardResult(dashboardResult)) {
      const dashboard = dashboardResult.payload.dashboard;
      onLoadWithoutCards?.(dashboard);
      await fetchDashboardCardData({ reload: false, clearCache: true });
      onLoad?.(dashboard);
    } else if (isFailedFetchDashboardResult(dashboardResult)) {
      setError(dashboardResult);
      onError?.(dashboardResult);
    }
  }, [
    dashboardId,
    fetchDashboard,
    fetchDashboardCardData,
    initialize,
    isNavigatingBackToDashboard,
    onError,
    onLoad,
    onLoadWithoutCards,
    parameterQueryParams,
  ]);

  const handleLoadCardData = useCallback(async () => {
    await fetchDashboardCardData();
    if (dashboard) {
      onLoad?.(dashboard);
    }
  }, [dashboard, fetchDashboardCardData, onLoad]);

  useEffect(() => {
    const shouldFetchDashboard = dashboardId !== previousDashboardId;

    const shouldFetchCardData =
      selectedTabId !== previousSelectedTabId ||
      !isEqual(parameterValues, previousParameterValues);

    if (isLoading) {
      return;
    }

    try {
      if (shouldFetchDashboard) {
        setIsLoading(true);
        setError(null);
        handleLoadDashboard();
      } else if (shouldFetchCardData && dashboard) {
        setIsLoading(true);
        setError(null);
        handleLoadCardData();
      }
    } catch (e) {
      const caughtError =
        e instanceof Error ? e : new Error("An unknown error occurred");
      setError(caughtError);
      onError?.({ error: caughtError, payload: error });
    } finally {
      setIsLoading(false);
    }
  }, [
    dashboardId,
    selectedTabId,
    parameterValues,
    dashboard,
    previousDashboardId,
    previousSelectedTabId,
    previousParameterValues,
    fetchDashboard,
    fetchDashboardCardData,
    initialize,
    onLoad,
    onLoadWithoutCards,
    onError,
    isNavigatingBackToDashboard,
    parameterQueryParams,
    error,
    isLoading,
    handleLoadDashboard,
    handleLoadCardData,
  ]);

  useUnmount(() => {
    cancelFetchDashboardCardData();
    reset();
    closeDashboard();
  });

  const contextValue: DashboardContextReturned = {
    dashboardId,
    parameterQueryParams,
    onLoad,
    onLoadWithoutCards,
    onError,
    isLoading,
    error,
    navigateToNewCardFromDashboard,
    shouldRenderAsNightMode,
    isFullscreen,
    onFullscreenChange,
    hasNightModeToggle,
    onNightModeChange,
    isNightMode,
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
    dashboard,
    selectedTabId,
    isEditing,
    isNavigatingBackToDashboard,
    parameterValues,
    cancelFetchDashboardCardData,
    fetchDashboard,
    fetchDashboardCardData,
    initialize,
    reset,
    closeDashboard,
    ...reduxProps,
  };

  return (
    <DashboardContext.Provider value={contextValue}>
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

// Helper functions exactly as provided in your first snippet
export function isSuccessfulFetchDashboardResult(
  result: FetchDashboardResult,
): result is SuccessfulFetchDashboardResult {
  const hasError = "error" in result;
  return !hasError;
}

export function isFailedFetchDashboardResult(
  result: FetchDashboardResult,
): result is FailedFetchDashboardResult {
  return (
    isObject(result.payload) && !result.payload.isCancelled && "error" in result
  );
}

export function isCancelledFetchDashboardResult(
  result: FetchDashboardResult,
): result is CancelledFetchDashboardResult {
  return isObject(result.payload) && Boolean(result.payload.isCancelled);
}
