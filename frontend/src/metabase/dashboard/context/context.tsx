import { assoc } from "icepick";
import {
  type PropsWithChildren,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { usePrevious, useUnmount } from "react-use";
import { isEqual, isObject, noop } from "underscore";

import { useEmbeddingEntityContext } from "metabase/embedding/context";
import { getTabHiddenParameterSlugs } from "metabase/public/lib/tab-parameters";
import type {
  Dashboard,
  DashboardCard,
  DashboardId,
  ParameterValuesMap,
} from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

import type { DashboardCardMenu } from "../components/DashCard/DashCardMenu/dashcard-menu";
import type { NavigateToNewCardFromDashboardOpts } from "../components/DashCard/types";
import type { DashboardActionKey } from "../components/DashboardHeader/DashboardHeaderButtonRow/types";
import {
  useDashboardFullscreen,
  useDashboardRefreshPeriod,
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

type DashboardActionButtonList = DashboardActionKey[] | null;

export type DashboardContextOwnProps = {
  dashboardId: DashboardId;
  parameterQueryParams?: ParameterValuesMap;
  onLoad?: (dashboard: Dashboard) => void;
  onError?: (error: unknown) => void;
  onLoadWithoutCards?: (dashboard: Dashboard) => void;
  onAddQuestion?: (dashboard: Dashboard | null) => void;
  navigateToNewCardFromDashboard:
    | ((opts: NavigateToNewCardFromDashboardOpts) => void)
    | null;
  dashcardMenu?: DashboardCardMenu | null;
  dashboardActions?:
    | DashboardActionButtonList
    | ((
        props: Pick<
          DashboardContextReturned,
          "isEditing" | "downloadsEnabled" | "withSubscriptions"
        >,
      ) => DashboardActionButtonList);
  isDashcardVisible?: (dc: DashboardCard) => boolean;
  isGuestEmbed?: boolean;
  /**
   * I want this to be optional, and error out when it's not passed, so it's obvious we need to pass it.
   * Forcing passing it isn't ideal since we only need to do this in a couple of places
   */
  onNewQuestion?: () => void;
  /**
   * When true, internal click behaviors (dashboard/question links) are preserved
   * instead of being filtered out. Used by the SDK for internal navigation.
   */
  enableEntityNavigation?: boolean;
};

export type DashboardContextOwnResult = {
  dashboardId: DashboardId | null;
  dashboardActions?: DashboardActionButtonList;
  isEditableDashboard: boolean;
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

export type DashboardContextProviderHandle = {
  refetchDashboard: () => void;
};

type FetchOption = {
  forceRefetch?: boolean;
};

const DashboardContextProviderInner = forwardRef(
  function DashboardContextProviderInner(
    {
      dashboardId,
      parameterQueryParams = {},
      onLoad,
      onLoadWithoutCards,
      onError,
      dashcardMenu,
      dashboardActions: initDashboardActions,
      isDashcardVisible,
      onNewQuestion,

      children,

      theme = "light",
      background = true,
      bordered = true,
      titled = true,
      font = null,
      hideParameters: hide_parameters = null,
      downloadsEnabled = { pdf: true, results: true },
      /**
       * TODO: (Kelvin 2025-11-17) See if we could communicate better how these default values are derived from. E.g. some are passed via the SDK props
       * which already have default values and we're setting another default values here again. One thing we could do is to have a constant file that
       * multiple places could refer to.
       */
      withSubscriptions = false,
      autoScrollToDashcardId = undefined,
      reportAutoScrolledToDashcard = noop,
      cardTitled = true,
      getClickActionMode = undefined,
      withFooter = true,
      enableEntityNavigation = true, // true in core app, SDK passes it down as false

      // redux selectors
      dashboard,
      selectedTabId,
      isEditing,
      isNavigatingBackToDashboard,
      parameterValues,
      isLoading,
      isLoadingWithoutCards,
      parameters,
      isEmbeddingIframe,
      isGuestEmbed,

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
    }: PropsWithChildren<ContextProps>,
    ref,
  ) {
    const [error, setError] = useState<unknown | null>(null);
    const previousIsLoading = usePrevious(isLoading);
    const previousIsLoadingWithoutCards = usePrevious(isLoadingWithoutCards);

    const previousDashboard = usePrevious(dashboard);
    const previousDashboardId = usePrevious(dashboardId);
    const previousTabId = usePrevious(selectedTabId);
    const previousParameterValues = usePrevious(parameterValues);

    const { token } = useEmbeddingEntityContext();

    const { refreshDashboardCardData } = useRefreshDashboard({
      dashboardId,
      parameterQueryParams,
    });

    const { onRefreshPeriodChange, refreshPeriod, setRefreshElapsedHook } =
      useDashboardRefreshPeriod({ onRefresh: refreshDashboardCardData });

    const {
      isFullscreen,
      onFullscreenChange,
      ref: fullscreenRef,
    } = useDashboardFullscreen();

    const handleError = useCallback(
      (error: unknown) => {
        onError?.(error);
        setError(error);
      },
      [onError],
    );

    const fetchData = useCallback(
      async (
        {
          dashboardId,
          token,
        }: {
          dashboardId: DashboardId;
          token: EntityToken | null | undefined;
        },
        option: FetchOption = {},
      ) => {
        const hasDashboardChanged = dashboardId !== previousDashboardId;
        const { forceRefetch } = option;
        // When forcing a refetch, we want to clear the cache
        const effectiveIsNavigatingBackToDashboard =
          isNavigatingBackToDashboard && !forceRefetch;
        if (hasDashboardChanged || forceRefetch) {
          setError(null);

          initialize({ clearCache: !effectiveIsNavigatingBackToDashboard });
          fetchDashboard({
            dashId: token ?? dashboardId,
            queryParams: parameterQueryParams,
            options: {
              clearCache: !effectiveIsNavigatingBackToDashboard,
              preserveParameters: effectiveIsNavigatingBackToDashboard,
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

    useImperativeHandle(ref, (): DashboardContextProviderHandle => {
      return {
        refetchDashboard() {
          if (dashboardId) {
            fetchData(
              {
                dashboardId,
                token,
              },
              {
                forceRefetch: true,
              },
            );
          }
        },
      };
    }, [dashboardId, token, fetchData]);

    useEffect(() => {
      if (dashboardId && dashboardId !== previousDashboardId) {
        reset();
        fetchData({ dashboardId, token });
      }
    }, [dashboardId, token, fetchData, previousDashboardId, reset]);

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

    const dashboardActions =
      typeof initDashboardActions === "function"
        ? initDashboardActions({
            isEditing,
            downloadsEnabled,
            withSubscriptions,
          })
        : (initDashboardActions ?? null);

    // Determine if the dashboard is editable.
    // This lets us distinguish read-only dashboards (e.g. public embeds, InteractiveDashboard)
    // from editable dashboards (e.g. main app, EditableDashboard).
    const isEditableDashboard = useMemo(() => {
      // When the dashboard is being edited, the "edit" action won't exist.
      if (isEditing) {
        return true;
      }

      // A dashboard is editable if it has the edit action and the user has write permissions.
      const hasEditDashboardAction = (dashboardActions ?? []).includes(
        "EDIT_DASHBOARD",
      );

      return hasEditDashboardAction && Boolean(dashboard?.can_write);
    }, [isEditing, dashboardActions, dashboard?.can_write]);

    return (
      <DashboardContext.Provider
        value={{
          dashboardId,
          dashboard: dashboardWithFilteredCards,
          parameterQueryParams,
          onLoad,
          onError,
          dashcardMenu,
          dashboardActions,
          onNewQuestion,
          isEditableDashboard,

          navigateToNewCardFromDashboard,
          isLoading,
          isLoadingWithoutCards,
          error,

          isFullscreen,
          onFullscreenChange,
          fullscreenRef,
          refreshPeriod,
          setRefreshElapsedHook,
          onRefreshPeriodChange,
          theme,
          background,
          bordered,
          titled,
          font,
          hideParameters,
          downloadsEnabled,
          withSubscriptions,
          autoScrollToDashcardId,
          reportAutoScrolledToDashcard,
          cardTitled,
          getClickActionMode,
          withFooter,
          enableEntityNavigation,

          // redux selectors
          selectedTabId,
          isEditing,
          isNavigatingBackToDashboard,
          parameters,
          parameterValues,
          isEmbeddingIframe,
          isGuestEmbed,

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
  },
);

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
