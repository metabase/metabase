import type { PropsWithChildren } from "react";
import { noop } from "underscore";

import {
  DashboardContext,
  type DashboardContextProps,
} from "metabase/dashboard/context";
import {
  type ReduxProps,
  connector,
} from "metabase/dashboard/context/context.redux";

const MockDashboardContextProvider = connector(DashboardContext.Provider);

export type MockDashboardContextProps = DashboardContextProps &
  Partial<ReduxProps>;

export const MockDashboardContext = ({
  children,

  dashboardId,
  parameterQueryParams,
  onLoad,
  onError,

  navigateToNewCardFromDashboard = null,

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

  ...reduxProps
}: PropsWithChildren<MockDashboardContextProps>) => {
  const shouldRenderAsNightMode = Boolean(isNightMode && isFullscreen);
  return (
    <MockDashboardContextProvider
      value={{
        dashboardId,
        parameterQueryParams,
        onLoad,
        onError,

        navigateToNewCardFromDashboard,
        isLoading: !reduxProps.dashboard,

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

        ...reduxProps,
      }}
    >
      {children}
    </MockDashboardContextProvider>
  );
};
