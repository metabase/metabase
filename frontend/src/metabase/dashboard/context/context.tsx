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

import { getTabHiddenParameterSlugs } from "metabase/public/lib/tab-parameters";
import type {
  Dashboard,
  DashboardCard,
  DashboardId,
  ParameterValuesMap,
} from "metabase-types/api";

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
import { useSelector } from "metabase/lib/redux";
import { getDashboard, getDashcards } from "../selectors";
import { dashcards } from "embedding-sdk-bundle/components/public/dashboard/tests/setup";

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
    | (({
        isEditing,
        downloadsEnabled,
      }: Pick<
        DashboardContextReturned,
        "isEditing" | "downloadsEnabled"
      >) => DashboardActionButtonList);
  isDashcardVisible?: (dc: DashboardCard) => boolean;
  /**
   * I want this to be optional, and error out when it's not passed, so it's obvious we need to pass it.
   * Forcing passing it isn't ideal since we only need to do this in a couple of places
   */
  onNewQuestion?: () => void;
};

export type DashboardContextOwnResult = {
  dashboardId: DashboardId | null;
  dashboardActions?: DashboardActionButtonList;
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

const defaultDownloadsEnabled = { pdf: true, results: true };

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
      downloadsEnabled = defaultDownloadsEnabled,
      autoScrollToDashcardId = undefined,
      reportAutoScrolledToDashcard = noop,
      cardTitled = true,
      getClickActionMode = undefined,
      withFooter = true,

      // redux selectors
      // dashboard,
      selectedTabId,
      isEditing,
      isNavigatingBackToDashboard,
      parameterValues,
      isLoading,
      isLoadingWithoutCards,
      parameters,
      isEmbeddingIframe,

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
      headerParameters,
      tabs,
      canManageSubscriptions,
      isAdmin,
      isSharing,
      dashboardBeforeEditing,
      isEditingParameter,
      editingParameter,
      isDirty,
      slowCards,
      draftParameterValues,
      loadingStartTime,
      clickBehaviorSidebarDashcard,
      isAddParameterPopoverOpen,
      sidebar,
      isRunning,
      isLoadingComplete,
      isHeaderVisible,
      isAdditionalInfoVisible,
      addHeadingDashCardToDashboard,
      addMarkdownDashCardToDashboard,
      addLinkDashCardToDashboard,
      setDashboardAttributes,
      setSharing,
      closeSidebar,
      addParameter,
      setParameterName,
      setParameterType,
      setParameterValue,
      setParameterIndex,
      setParameterValueToDefault,
      setEditingParameter,
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
      updateDashboard,
      setSidebar,
      hideAddParameterPopover,
      onChangeLocation,
      setArchivedDashboard,
      deletePermanently,
      moveDashboardToCollection,
      createNewTab,
      deleteTab,
      duplicateTab,
      moveTab,
      renameTab,
      selectTab,
      undoDeleteTab,
      onAddQuestion,
    }: PropsWithChildren<ContextProps>,
    ref,
  ) {
    const [error, setError] = useState<unknown | null>(null);
    const previousIsLoading = usePrevious(isLoading);
    const previousIsLoadingWithoutCards = usePrevious(isLoadingWithoutCards);

    const _dashboard = useSelector(getDashboard);
    const dashcards = useSelector(getDashcards);

    const dashboard = useMemo(() => {
      if (!_dashboard) {
        return null;
      }

      const orderedDashcards = _dashboard.dashcards
        .map((id) => dashcards[id])
        .filter((dc) => !dc.isRemoved)
        .sort((a, b) => {
          const rowDiff = a.row - b.row;

          // sort by y position first
          if (rowDiff !== 0) {
            return rowDiff;
          }

          // for items on the same row, sort by x position
          return a.col - b.col;
        });

      return (
        _dashboard && {
          ..._dashboard,
          dashcards: orderedDashcards,
        }
      );
    }, [_dashboard?.id]);

    const previousDashboard = usePrevious(dashboard);
    const previousDashboardId = usePrevious(dashboardId);
    const previousTabId = usePrevious(selectedTabId);
    const previousParameterValues = usePrevious(parameterValues);

    const dashboardIncomplete = useSelector(getDashboard);

    useEffect(() => {
      console.log("bare _dashboard rerendered", _dashboard);
    }, [_dashboard]);

    useEffect(() => {
      console.log("complete dashboard rerendered", dashboard);
    }, [dashboard]);

    useEffect(() => {
      console.log("dashboardIncomplete rerendered", dashboardIncomplete);
    }, [dashboardIncomplete]);

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
      async (dashboardId: DashboardId, option: FetchOption = {}) => {
        const hasDashboardChanged = dashboardId !== previousDashboardId;
        const { forceRefetch } = option;
        // When forcing a refetch, we want to clear the cache
        const effectiveIsNavigatingBackToDashboard =
          isNavigatingBackToDashboard && !forceRefetch;
        if (hasDashboardChanged || forceRefetch) {
          setError(null);

          initialize({ clearCache: !effectiveIsNavigatingBackToDashboard });
          fetchDashboard({
            dashId: dashboardId,
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
            fetchData(dashboardId, {
              forceRefetch: true,
            });
          }
        },
      };
    }, [dashboardId, fetchData]);

    useEffect(() => {
      if (dashboardId && dashboardId !== previousDashboardId) {
        reset();
        fetchData(dashboardId);
      }
    }, [dashboardId, fetchData, previousDashboardId, reset]);

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
      // if (dashboard && isDashcardVisible) {
      //   return assoc(
      //     dashboard,
      //     "dashcards",
      //     dashboard.dashcards.filter(isDashcardVisible),
      //   );
      // }
      return dashboard;
    }, [dashboard, isDashcardVisible]);

    const dashboardActions =
      typeof initDashboardActions === "function"
        ? initDashboardActions({ isEditing, downloadsEnabled })
        : (initDashboardActions ?? null);

    // Track individual Redux state fields from mapStateToProps
    useEffect(() => {
      console.log("📊 [Redux State] parameters");
    }, [parameters]);

    useEffect(() => {
      console.log("📊 [Redux State] headerParameters");
    }, [headerParameters]);

    useEffect(() => {
      console.log("📊 [Redux State] tabs");
    }, [tabs]);

    useEffect(() => {
      console.log("📊 [Redux State] canManageSubscriptions");
    }, [canManageSubscriptions]);

    useEffect(() => {
      console.log("📊 [Redux State] isAdmin");
    }, [isAdmin]);

    useEffect(() => {
      console.log("📊 [Redux State] isEditing");
    }, [isEditing]);

    useEffect(() => {
      console.log("📊 [Redux State] isSharing");
    }, [isSharing]);

    useEffect(() => {
      console.log("📊 [Redux State] dashboardBeforeEditing");
    }, [dashboardBeforeEditing]);

    useEffect(() => {
      console.log("📊 [Redux State] isEditingParameter");
    }, [isEditingParameter]);

    useEffect(() => {
      console.log("📊 [Redux State] editingParameter");
    }, [editingParameter]);

    useEffect(() => {
      console.log("📊 [Redux State] isDirty");
    }, [isDirty]);

    useEffect(() => {
      console.log("📊 [Redux State] slowCards");
    }, [slowCards]);

    useEffect(() => {
      console.log("📊 [Redux State] parameterValues");
    }, [parameterValues]);

    useEffect(() => {
      console.log("📊 [Redux State] draftParameterValues");
    }, [draftParameterValues]);

    useEffect(() => {
      console.log("📊 [Redux State] loadingStartTime");
    }, [loadingStartTime]);

    useEffect(() => {
      console.log("📊 [Redux State] clickBehaviorSidebarDashcard");
    }, [clickBehaviorSidebarDashcard]);

    useEffect(() => {
      console.log("📊 [Redux State] isAddParameterPopoverOpen");
    }, [isAddParameterPopoverOpen]);

    useEffect(() => {
      console.log("📊 [Redux State] sidebar");
    }, [sidebar]);

    useEffect(() => {
      console.log("📊 [Redux State] isRunning");
    }, [isRunning]);

    useEffect(() => {
      console.log("📊 [Redux State] isLoadingComplete");
    }, [isLoadingComplete]);

    useEffect(() => {
      console.log("📊 [Redux State] isHeaderVisible");
    }, [isHeaderVisible]);

    useEffect(() => {
      console.log("📊 [Redux State] isAdditionalInfoVisible");
    }, [isAdditionalInfoVisible]);

    useEffect(() => {
      console.log("📊 [Redux State] selectedTabId");
    }, [selectedTabId]);

    useEffect(() => {
      console.log("📊 [Redux State] isNavigatingBackToDashboard");
    }, [isNavigatingBackToDashboard]);

    useEffect(() => {
      console.log("📊 [Redux State] isLoading");
    }, [isLoading]);

    useEffect(() => {
      console.log("📊 [Redux State] isLoadingWithoutCards");
    }, [isLoadingWithoutCards]);

    useEffect(() => {
      console.log("📊 [Redux State] isEmbeddingIframe");
    }, [isEmbeddingIframe]);

    // Track individual Redux action creators from mapDispatchToProps
    useEffect(() => {
      console.log("⚡ [Redux Action] initialize");
    }, [initialize]);

    useEffect(() => {
      console.log("⚡ [Redux Action] cancelFetchDashboardCardData");
    }, [cancelFetchDashboardCardData]);

    useEffect(() => {
      console.log("⚡ [Redux Action] addCardToDashboard");
    }, [addCardToDashboard]);

    useEffect(() => {
      console.log("⚡ [Redux Action] addHeadingDashCardToDashboard");
    }, [addHeadingDashCardToDashboard]);

    useEffect(() => {
      console.log("⚡ [Redux Action] addMarkdownDashCardToDashboard");
    }, [addMarkdownDashCardToDashboard]);

    useEffect(() => {
      console.log("⚡ [Redux Action] addLinkDashCardToDashboard");
    }, [addLinkDashCardToDashboard]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setEditingDashboard");
    }, [setEditingDashboard]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setDashboardAttributes");
    }, [setDashboardAttributes]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setSharing");
    }, [setSharing]);

    useEffect(() => {
      console.log("⚡ [Redux Action] toggleSidebar");
    }, [toggleSidebar]);

    useEffect(() => {
      console.log("⚡ [Redux Action] closeSidebar");
    }, [closeSidebar]);

    useEffect(() => {
      console.log("⚡ [Redux Action] addParameter");
    }, [addParameter]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterName");
    }, [setParameterName]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterType");
    }, [setParameterType]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterValue");
    }, [setParameterValue]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterIndex");
    }, [setParameterIndex]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterValueToDefault");
    }, [setParameterValueToDefault]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setEditingParameter");
    }, [setEditingParameter]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterDefaultValue");
    }, [setParameterDefaultValue]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterRequired");
    }, [setParameterRequired]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterTemporalUnits");
    }, [setParameterTemporalUnits]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterIsMultiSelect");
    }, [setParameterIsMultiSelect]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterQueryType");
    }, [setParameterQueryType]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterSourceType");
    }, [setParameterSourceType]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterSourceConfig");
    }, [setParameterSourceConfig]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setParameterFilteringParameters");
    }, [setParameterFilteringParameters]);

    useEffect(() => {
      console.log("⚡ [Redux Action] showAddParameterPopover");
    }, [showAddParameterPopover]);

    useEffect(() => {
      console.log("⚡ [Redux Action] removeParameter");
    }, [removeParameter]);

    useEffect(() => {
      console.log(
        "⚡ [Redux Action] onReplaceAllDashCardVisualizationSettings",
      );
    }, [onReplaceAllDashCardVisualizationSettings]);

    useEffect(() => {
      console.log("⚡ [Redux Action] onUpdateDashCardVisualizationSettings");
    }, [onUpdateDashCardVisualizationSettings]);

    useEffect(() => {
      console.log("⚡ [Redux Action] onUpdateDashCardColumnSettings");
    }, [onUpdateDashCardColumnSettings]);

    useEffect(() => {
      console.log("⚡ [Redux Action] updateDashboardAndCards");
    }, [updateDashboardAndCards]);

    useEffect(() => {
      console.log("⚡ [Redux Action] updateDashboard");
    }, [updateDashboard]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setSidebar");
    }, [setSidebar]);

    useEffect(() => {
      console.log("⚡ [Redux Action] hideAddParameterPopover");
    }, [hideAddParameterPopover]);

    useEffect(() => {
      console.log("⚡ [Redux Action] fetchDashboard");
    }, [fetchDashboard]);

    useEffect(() => {
      console.log("⚡ [Redux Action] fetchDashboardCardData");
    }, [fetchDashboardCardData]);

    useEffect(() => {
      console.log("⚡ [Redux Action] onChangeLocation");
    }, [onChangeLocation]);

    useEffect(() => {
      console.log("⚡ [Redux Action] reset");
    }, [reset]);

    useEffect(() => {
      console.log("⚡ [Redux Action] closeDashboard");
    }, [closeDashboard]);

    useEffect(() => {
      console.log("⚡ [Redux Action] setArchivedDashboard");
    }, [setArchivedDashboard]);

    useEffect(() => {
      console.log("⚡ [Redux Action] deletePermanently");
    }, [deletePermanently]);

    useEffect(() => {
      console.log("⚡ [Redux Action] moveDashboardToCollection");
    }, [moveDashboardToCollection]);

    useEffect(() => {
      console.log("⚡ [Redux Action] createNewTab");
    }, [createNewTab]);

    useEffect(() => {
      console.log("⚡ [Redux Action] deleteTab");
    }, [deleteTab]);

    useEffect(() => {
      console.log("⚡ [Redux Action] duplicateTab");
    }, [duplicateTab]);

    useEffect(() => {
      console.log("⚡ [Redux Action] moveTab");
    }, [moveTab]);

    useEffect(() => {
      console.log("⚡ [Redux Action] renameTab");
    }, [renameTab]);

    useEffect(() => {
      console.log("⚡ [Redux Action] selectTab");
    }, [selectTab]);

    useEffect(() => {
      console.log("⚡ [Redux Action] undoDeleteTab");
    }, [undoDeleteTab]);

    useEffect(() => {
      console.log("⚡ [Redux Action] onAddQuestion");
    }, [onAddQuestion]);

    const contextValue = useMemo(() => {
      return {
        dashboardId,
        dashboard: dashboardWithFilteredCards,
        parameterQueryParams,
        onLoad,
        onError,
        dashcardMenu,
        dashboardActions,
        onNewQuestion,

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
        isEmbeddingIframe,

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
        headerParameters,
        tabs,
        canManageSubscriptions,
        isAdmin,
        isSharing,
        dashboardBeforeEditing,
        isEditingParameter,
        editingParameter,
        isDirty,
        slowCards,
        draftParameterValues,
        loadingStartTime,
        clickBehaviorSidebarDashcard,
        isAddParameterPopoverOpen,
        sidebar,
        isRunning,
        isLoadingComplete,
        isHeaderVisible,
        isAdditionalInfoVisible,
        addHeadingDashCardToDashboard,
        addMarkdownDashCardToDashboard,
        addLinkDashCardToDashboard,
        setDashboardAttributes,
        setSharing,
        closeSidebar,
        addParameter,
        setParameterName,
        setParameterType,
        setParameterValue,
        setParameterIndex,
        setParameterValueToDefault,
        setEditingParameter,
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
        updateDashboard,
        setSidebar,
        hideAddParameterPopover,
        onChangeLocation,
        setArchivedDashboard,
        deletePermanently,
        moveDashboardToCollection,
        createNewTab,
        deleteTab,
        duplicateTab,
        moveTab,
        renameTab,
        selectTab,
        undoDeleteTab,
        onAddQuestion,
      };
    }, [
      dashboardId,
      dashboardWithFilteredCards,
      parameterQueryParams,
      onLoad,
      onError,
      dashcardMenu,
      dashboardActions,
      onNewQuestion,
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
      autoScrollToDashcardId,
      reportAutoScrolledToDashcard,
      cardTitled,
      getClickActionMode,
      withFooter,
      selectedTabId,
      isEditing,
      isNavigatingBackToDashboard,
      parameters,
      parameterValues,
      isEmbeddingIframe,
      addCardToDashboard,
      cancelFetchDashboardCardData,
      fetchDashboard,
      fetchDashboardCardData,
      initialize,
      setEditingDashboard,
      toggleSidebar,
      reset,
      closeDashboard,
      headerParameters,
      tabs,
      canManageSubscriptions,
      isAdmin,
      isSharing,
      dashboardBeforeEditing,
      isEditingParameter,
      editingParameter,
      isDirty,
      slowCards,
      draftParameterValues,
      loadingStartTime,
      clickBehaviorSidebarDashcard,
      isAddParameterPopoverOpen,
      sidebar,
      isRunning,
      isLoadingComplete,
      isHeaderVisible,
      isAdditionalInfoVisible,
      addHeadingDashCardToDashboard,
      addMarkdownDashCardToDashboard,
      addLinkDashCardToDashboard,
      setDashboardAttributes,
      setSharing,
      closeSidebar,
      addParameter,
      setParameterName,
      setParameterType,
      setParameterValue,
      setParameterIndex,
      setParameterValueToDefault,
      setEditingParameter,
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
      updateDashboard,
      setSidebar,
      hideAddParameterPopover,
      onChangeLocation,
      setArchivedDashboard,
      deletePermanently,
      moveDashboardToCollection,
      createNewTab,
      deleteTab,
      duplicateTab,
      moveTab,
      renameTab,
      selectTab,
      undoDeleteTab,
      onAddQuestion,
    ]);

    return (
      <DashboardContext.Provider value={contextValue}>
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
