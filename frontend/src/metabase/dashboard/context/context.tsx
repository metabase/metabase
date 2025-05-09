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

export type DashboardContextErrorState = {
  error: Error | null;
};

export type DashboardContextOwnProps = {
  dashboardId: DashboardId;
  parameterQueryParams?: Query;
  onLoad?: (dashboard: Dashboard) => void;
  onError?: (error: Error) => void;
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

export type DashboardContextProps = DashboardContextOwnProps &
  Partial<DashboardControls>;

type ContextProps = DashboardContextProps & ReduxProps;

export type DashboardContextReturned = DashboardContextOwnResult &
  DashboardContextOwnProps &
  ReduxProps &
  Required<DashboardControls> &
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
  isLoading,
  isLoadingWithoutCards,

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
  navigateToNewCardFromDashboard,
  ...reduxProps
}: PropsWithChildren<ContextProps>) => {
  const [error, setError] = useState<Error | null>(null);
  const previousIsLoading = usePrevious(isLoading);
  const previousIsLoadingWithoutCards = usePrevious(isLoadingWithoutCards);

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

      return result;
    },
    [
      fetchDashboard,
      initialize,
      isNavigatingBackToDashboard,
      parameterQueryParams,
    ],
  );

  const handleError = useCallback(
    (error: Error) => {
      onError?.(error);
      setError(error);
    },
    [onError],
  );

  useEffect(() => {
    const hasDashboardChanged = dashboardId !== previousDashboardId;
    if (hasDashboardChanged) {
      setError(null);
      handleLoadDashboard(dashboardId)
        .then((result) => {
          if (isFailedFetchDashboardResult(result)) {
            handleError(result.payload as Error);
          }
        })
        .catch((err) => {
          handleError(err);
        });
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

    try {
      if (hasDashboardLoaded) {
        fetchDashboardCardData({ reload: false, clearCache: true });
      } else if (hasTabChanged || hasParameterValueChanged) {
        fetchDashboardCardData();
      }
    } catch (e) {
      handleError?.(e as Error);
    }
  }, [
    dashboard,
    dashboardId,
    fetchDashboardCardData,
    handleError,
    handleLoadDashboard,
    onError,
    parameterValues,
    previousDashboard,
    previousDashboardId,
    previousParameterValues,
    previousTabId,
    selectedTabId,
  ]);

  useEffect(() => {
    if (
      !isLoadingWithoutCards &&
      previousIsLoadingWithoutCards &&
      !error &&
      dashboard
    ) {
      onLoadWithoutCards?.(dashboard);
      // For whatever reason, isLoading waits for all cards to be loaded but doesn't account for the
      // fact that there might be no dashcards. So onLoad never triggers when there are no cards,
      // so this solves that issue
      if (dashboard?.dashcards.length === 0) {
        onLoad?.(dashboard);
      }
    }
  }, [
    previousIsLoadingWithoutCards,
    dashboard,
    onLoadWithoutCards,
    error,
    isLoadingWithoutCards,
    onLoad,
  ]);

  useEffect(() => {
    if (!isLoading && previousIsLoading && !error && dashboard) {
      onLoad?.(dashboard);
    }
  }, [isLoading, previousIsLoading, dashboard, onLoad, error]);

  useUnmount(() => {
    cancelFetchDashboardCardData();
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

        navigateToNewCardFromDashboard,
        isLoading,
        isLoadingWithoutCards,
        error,

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
