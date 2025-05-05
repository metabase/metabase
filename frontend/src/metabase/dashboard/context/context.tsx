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
import type {
  DisplayTheme,
  EmbedResourceDownloadOptions,
} from "metabase/public/lib/types";
import type { DashboardId } from "metabase-types/api";

import { navigateToNewCardFromDashboard } from "../actions";
import type { NavigateToNewCardFromDashboardOpts } from "../components/DashCard/types";
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

import { type ReduxProps, connector } from "./context.redux";

type DashboardLoadingState = {
  isLoading: boolean;
};

type OwnProps = {
  dashboardId: DashboardId;
  parameterQueryParams?: Record<string, string>;
  onLoad?: (result: SuccessfulFetchDashboardResult) => void;
  onError?: (result: FailedFetchDashboardResult) => void;
  navigateToNewCardFromDashboard?: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
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
  downloadsEnabled: EmbedResourceDownloadOptions;
};

type DashboardControls = DashboardFullscreenControls &
  DashboardNightModeControls &
  DashboardRefreshPeriodControls &
  UseAutoScrollToDashcardResult &
  DashboardOptions;

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

  const handleAddQuestion = useCallback(() => {
    if (!isEditing) {
      onRefreshPeriodChange?.(null);
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
          onError?.(result);
        }
        return;
      }
      onLoad?.(result);
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
        font,
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
        navigateToNewCardFromDashboard:
          _navigateToNewCardFromDashboard ??
          (() => dispatch(navigateToNewCardFromDashboard())),
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
