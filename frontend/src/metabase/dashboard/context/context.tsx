import { assoc } from "icepick";
import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePrevious, useUnmount } from "react-use";
import { isEqual, isObject, noop } from "underscore";

import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import { fetchEntityId } from "metabase/lib/entity-id/fetch-entity-id";
import { useDispatch } from "metabase/lib/redux";
import { getTabHiddenParameterSlugs } from "metabase/public/lib/tab-parameters";
import type { Dashboard, DashboardCard, DashboardId } from "metabase-types/api";

import type { DashboardCardMenu } from "../components/DashCard/DashCardMenu/dashcard-menu";
import type { NavigateToNewCardFromDashboardOpts } from "../components/DashCard/types";
import {
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
  useEmbedTheme,
  useRefreshDashboard,
} from "../hooks";
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
  error: unknown | null;
};

export type DashboardContextOwnProps = {
  dashboardId: DashboardId;
  parameterQueryParams?: ParameterValues;
  onLoad?: (dashboard: Dashboard) => void;
  onError?: (error: unknown) => void;
  onLoadWithoutCards?: (dashboard: Dashboard) => void;
  onAddQuestion?: (dashboard: Dashboard | null) => void;
  navigateToNewCardFromDashboard:
    | ((opts: NavigateToNewCardFromDashboardOpts) => void)
    | null;
  dashcardMenu?: DashboardCardMenu | null;
  isDashcardVisible?: (dc: DashboardCard) => boolean;
};

export type DashboardContextOwnResult = {
  shouldRenderAsNightMode: boolean;
  dashboardIdProp: DashboardContextOwnProps["dashboardId"];
  dashboardId: DashboardId | null;
};

export type DashboardControls = UseAutoScrollToDashcardResult &
  EmbedDisplayParams;

export type DashboardContextProps = DashboardContextOwnProps &
  Partial<DashboardControls>;

type ContextProps = DashboardContextProps & ReduxProps;

export type DashboardContextReturned = DashboardContextOwnResult &
  Omit<DashboardContextOwnProps, "dashboardId"> &
  ReduxProps &
  Required<DashboardControls> &
  DashboardContextErrorState &
  DashboardFullscreenControls & {
    fullscreenRef: ReturnType<typeof useDashboardFullscreen>["ref"];
  } & DashboardRefreshPeriodControls &
  EmbedThemeControls;

export const DashboardContext = createContext<
  DashboardContextReturned | undefined
>(undefined);

const DashboardContextProviderInner = ({
  dashboardId: dashboardIdProp,
  parameterQueryParams = {},
  onLoad,
  onLoadWithoutCards,
  onError,
  dashcardMenu,
  isDashcardVisible,

  children,

  background = true,
  bordered = true,
  titled = true,
  font = null,
  hideParameters: hide_parameters = null,
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
  parameters,

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
  const [error, setError] = useState<unknown | null>(null);
  const previousIsLoading = usePrevious(isLoading);
  const previousIsLoadingWithoutCards = usePrevious(isLoadingWithoutCards);

  const [dashboardId, setDashboardId] = useState<DashboardId | null>(null);
  const previousDashboard = usePrevious(dashboard);
  const previousDashboardId = usePrevious(dashboardId);
  const previousTabId = usePrevious(selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);

  const { refreshDashboard } = useRefreshDashboard({
    dashboardId,
    parameterQueryParams,
  });

  const { onRefreshPeriodChange, refreshPeriod, setRefreshElapsedHook } =
    useDashboardRefreshPeriod({ onRefresh: refreshDashboard });

  const {
    isFullscreen,
    onFullscreenChange,
    ref: fullscreenRef,
  } = useDashboardFullscreen();

  const {
    hasNightModeToggle,
    isNightMode,
    onNightModeChange,
    theme,
    setTheme,
  } = useEmbedTheme();

  const shouldRenderAsNightMode = Boolean(isNightMode && isFullscreen);

  const handleError = useCallback(
    (error: unknown) => {
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
          });
        }
        setDashboardId(id);
      } catch (e) {
        handleError(e);
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
              handleError(result.payload);
            }
          })
          .catch((err) => handleError(err));
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
      handleError?.(e);
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
    if (dashboardIdProp !== dashboardId) {
      fetchId(dashboardIdProp);
    }
  }, [dashboardId, dispatch, fetchId, handleError, dashboardIdProp]);

  useEffect(() => {
    if (dashboardIdProp && dashboardId && dashboardId !== previousDashboardId) {
      reset();
      fetchData(dashboardId);
    }
  }, [dashboardId, fetchData, dashboardIdProp, previousDashboardId, reset]);

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
      // so this solves that issue for now.
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

  const hiddenParameterSlugs = useMemo(
    () =>
      getTabHiddenParameterSlugs({
        parameters,
        dashboard,
        selectedTabId,
      }),
    [dashboard, parameters, selectedTabId],
  );

  const hideParameters = !isEditing
    ? [hide_parameters, hiddenParameterSlugs].filter(Boolean).join(",")
    : null;
  // For public/static dashboards, we want to make sure that we don't show action cards
  // so we have a filter function here to remove those. We can/will also add this
  // functionality in the SDK in the future, which is why it's a generic prop
  const dashboardWithFilteredCards = useMemo(() => {
    if (dashboard && isDashcardVisible) {
      return assoc(
        dashboard,
        "dashcards",
        dashboard.dashcards.filter(isDashcardVisible),
      );
    }
    return dashboard;
  }, [dashboard, isDashcardVisible]);

  return (
    <DashboardContext.Provider
      value={{
        dashboardIdProp: dashboardIdProp,
        dashboardId,
        dashboard: dashboardWithFilteredCards,
        parameterQueryParams,
        onLoad,
        onError,
        dashcardMenu,

        navigateToNewCardFromDashboard,
        isLoading,
        isLoadingWithoutCards,
        error,

        isFullscreen,
        onFullscreenChange,
        fullscreenRef,
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
        selectedTabId,
        isEditing,
        isNavigatingBackToDashboard,
        parameters,
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
