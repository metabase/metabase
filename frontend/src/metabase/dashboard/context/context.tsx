import type { Query } from "history";
import { assoc } from "icepick";
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

import { fetchEntityId } from "metabase/lib/entity-id/fetch-entity-id";
import { useDispatch } from "metabase/lib/redux";
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
import { isActionDashCard } from "../utils";

import type { DashboardModeProp } from "./DashboardMode";
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
} & DashboardModeProp;

export type DashboardContextOwnResult = {
  shouldRenderAsNightMode: boolean;
  initialDashboardId: DashboardContextOwnProps["dashboardId"];
  dashboardId: DashboardId | null;
};

export type DashboardControls = DashboardFullscreenControls &
  DashboardRefreshPeriodControls &
  UseAutoScrollToDashcardResult &
  EmbedDisplayParams &
  EmbedThemeControls;

export type DashboardContextProps = DashboardContextOwnProps &
  Partial<DashboardControls>;

type ContextProps = DashboardContextProps & ReduxProps;

type ContextReturned = DashboardContextOwnResult &
  Omit<DashboardContextOwnProps, "dashboardId"> &
  ReduxProps &
  Required<DashboardControls> &
  DashboardContextErrorState;

export const DashboardContext = createContext<ContextReturned | undefined>(
  undefined,
);

const DashboardContextProviderInner = ({
  dashboardId: initialDashboardId,
  parameterQueryParams = {},
  onLoad,
  onLoadWithoutCards,
  onError,
  mode,

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
  const dispatch = useDispatch();
  const [error, setError] = useState<Error | null>(null);
  const previousIsLoading = usePrevious(isLoading);
  const previousIsLoadingWithoutCards = usePrevious(isLoadingWithoutCards);

  const [dashboardId, setDashboardId] = useState<DashboardId | null>(null);
  const previousDashboard = usePrevious(dashboard);
  const previousDashboardId = usePrevious(dashboardId);
  const previousTabId = usePrevious(selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);

  const shouldRenderAsNightMode = Boolean(isNightMode && isFullscreen);

  const handleError = useCallback(
    (error: Error) => {
      onError?.(error);
      setError(error);
    },
    [onError],
  );

  const fetchId = useCallback(
    async (idToFetch: DashboardId) => {
      try {
        const { id, isError } = await dispatch(
          fetchEntityId({ type: "dashboard", id: idToFetch }),
        );
        if (isError || id === null) {
          handleError({
            status: 404,
            message: "Not found",
            name: "Not found",
          } as Error);
          setDashboardId(id);
        }
        setDashboardId(id);
      } catch (e) {
        handleError(e as Error);
      }

      return;
    },
    [dispatch, handleError],
  );

  const fetchData = useCallback(
    async (dashboardId: DashboardId) => {
      const hasDashboardChanged = dashboardId !== previousDashboardId;
      if (hasDashboardChanged) {
        setError(null);

        initialize({ clearCache: !isNavigatingBackToDashboard });
        fetchDashboard({
          dashId: dashboardId,
          queryParams: parameterQueryParams,
          options: {
            clearCache: !isNavigatingBackToDashboard,
            preserveParameters: isNavigatingBackToDashboard,
          },
        })
          .then((result) => {
            if (isFailedFetchDashboardResult(result)) {
              handleError(result.payload as Error);
            }
          })
          .catch((err) => handleError(err as Error));
      }
    },
    [
      fetchDashboard,
      handleError,
      initialize,
      isNavigatingBackToDashboard,
      parameterQueryParams,
      previousDashboardId,
    ],
  );

  const fetchCards = useCallback(() => {
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
    fetchDashboardCardData,
    handleError,
    parameterValues,
    previousDashboard,
    previousParameterValues,
    previousTabId,
    selectedTabId,
  ]);

  useEffect(() => {
    if (initialDashboardId !== dashboardId) {
      fetchId(initialDashboardId);
    }
  }, [dashboardId, dispatch, fetchId, handleError, initialDashboardId]);

  useEffect(() => {
    if (
      initialDashboardId &&
      dashboardId &&
      dashboardId !== previousDashboardId
    ) {
      fetchData(dashboardId);
    }
  }, [dashboardId, fetchData, initialDashboardId, previousDashboardId]);

  useEffect(() => {
    if (dashboard) {
      fetchCards();
    }
  }, [dashboard, fetchCards]);

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

  // TODO: Create a Dashboard specific `Mode` class that will handle these properties.
  const visibleDashcards = (dashboard?.dashcards ?? []).filter(
    (dashcard) => !isActionDashCard(dashcard),
  );

  return (
    <DashboardContext.Provider
      value={{
        initialDashboardId,
        dashboardId,
        parameterQueryParams,
        onLoad,
        onError,
        mode,

        navigateToNewCardFromDashboard,
        isLoading: isLoading && !error,
        isLoadingWithoutCards: isLoadingWithoutCards && !error,
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
        dashboard:
          mode === "editable" && dashboard
            ? assoc(dashboard, "dashcards", visibleDashcards)
            : dashboard,
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
