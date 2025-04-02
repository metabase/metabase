import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePrevious, useUnmount } from "react-use";
import { isEqual, isObject } from "underscore";

import type { DisplayTheme } from "metabase/public/lib/types";
import type { DashboardId } from "metabase-types/api";

import { SIDEBAR_NAME } from "../constants";
import type { UseAutoScrollToDashcardResult } from "../hooks/use-auto-scroll-to-dashcard";
import type {
  DashboardFullscreenControls,
  DashboardNightModeControls,
  DashboardRefreshPeriodControls,
  EmbedBackground,
  EmbedFont,
  EmbedHideParameters,
  EmbedTitle,
  FailedFetchDashboardResult,
  FetchDashboardResult,
  SuccessfulFetchDashboardResult,
} from "../types";

import { type ReduxProps, connector } from "./redux";

type DashboardLoadingState = {
  isLoading: boolean;
};

type OwnProps = {
  dashboardId: DashboardId;
  parameterQueryParams: Record<string, string>;
  onLoad: (result: SuccessfulFetchDashboardResult) => void;
  onError: (result: FailedFetchDashboardResult) => void;
};

type OwnResult = {
  shouldRenderAsNightMode: boolean;
  handleAddQuestion: () => void;
};

type DashboardOptions = {
  background: EmbedBackground;
  bordered: boolean;
  titled: EmbedTitle;
  hideParameters: EmbedHideParameters;
  font: EmbedFont;
  theme: DisplayTheme;
  setTheme: (theme: DisplayTheme) => void;
  downloadsEnabled: boolean;
};

type DashboardControls = DashboardFullscreenControls &
  DashboardNightModeControls &
  DashboardRefreshPeriodControls &
  UseAutoScrollToDashcardResult &
  DashboardOptions;

type ContextProps = OwnProps & ReduxProps & DashboardControls;

type ContextReturned = OwnResult & ContextProps & DashboardLoadingState;

const DashboardContext = createContext<ContextReturned | undefined>(undefined);

const DashboardContextProviderInner = ({
  dashboardId,
  parameterQueryParams,
  onLoad,
  onError,

  children,

  // url params
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
  theme,
  setTheme,
  hideParameters,
  downloadsEnabled,
  autoScrollToDashcardId,
  reportAutoScrolledToDashcard,

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
  ...reduxProps
}: PropsWithChildren<ContextProps>) => {
  const [isInitialized, setIsInitialized] = useState(false);

  const previousDashboard = usePrevious(dashboard);
  const previousDashboardId = usePrevious(dashboardId);
  const previousTabId = usePrevious(selectedTabId);
  const previousParameterValues = usePrevious(parameterValues);

  const shouldRenderAsNightMode = isNightMode && isFullscreen;

  const handleAddQuestion = useCallback(() => {
    if (!isEditing) {
      onRefreshPeriodChange(null);
      setEditingDashboard(dashboard);
    }
    toggleSidebar(SIDEBAR_NAME.addQuestion);
  }, [
    dashboard,
    isEditing,
    onRefreshPeriodChange,
    setEditingDashboard,
    toggleSidebar,
  ]);

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
        if (isFailedFetchDashboardResult(result)) {
          onError(result);
        }
        return;
      }
      onLoad(result);
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

        isLoading: !dashboard,

        handleAddQuestion,

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
        theme,
        setTheme,
        hideParameters,
        downloadsEnabled,
        autoScrollToDashcardId,
        reportAutoScrolledToDashcard,

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
