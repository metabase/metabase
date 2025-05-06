import type { PropsWithChildren } from "react";
import { noop } from "underscore";

import {
  DashboardContext,
  type DashboardContextOwnProps,
  type DashboardContextOwnResult,
  type DashboardContextProps,
  type DashboardControls,
} from "metabase/dashboard/context";
import {
  type ReduxProps,
  connector,
} from "metabase/dashboard/context/context.redux";

// Create a component that accepts all redux props and passes them into DashboardContext
const DashboardContextWithReduxProps = (
  props: PropsWithChildren<
    ReduxProps &
      DashboardContextOwnProps &
      DashboardContextOwnResult &
      DashboardControls
  >,
) => (
  <DashboardContext.Provider value={{ isLoading: !props.dashboard, ...props }}>
    {props.children}
  </DashboardContext.Provider>
);

// Connect the component to Redux to get all the Redux props
const ConnectedDashboardContextWithReduxProps = connector(
  DashboardContextWithReduxProps,
);

export type MockDashboardContextProps = DashboardContextProps &
  Partial<ReduxProps>;

/*
 * NOTE: DO NOT USE THIS IN REAL COMPONENTS. This is specifically for the storybook stories for the
 * PublicOrEmbeddedDashboardView. We were relying on hard-coded redux values passed directly into
 * the component, but this is different now with the dashboard context.
 *
 * TODO: Adapt PublicOrEmbeddedDashboardView stories to new dashboard context code by adding data
 * directly to the redux store instead of overriding data. Then we can maybe even use the
 * actual context for our stories.
 * */
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
    <ConnectedDashboardContextWithReduxProps
      dashboardId={dashboardId}
      parameterQueryParams={parameterQueryParams}
      onLoad={onLoad}
      onError={onError}
      navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
      isFullscreen={isFullscreen}
      onFullscreenChange={onFullscreenChange}
      hasNightModeToggle={hasNightModeToggle}
      onNightModeChange={onNightModeChange}
      isNightMode={isNightMode}
      shouldRenderAsNightMode={shouldRenderAsNightMode}
      refreshPeriod={refreshPeriod}
      setRefreshElapsedHook={setRefreshElapsedHook}
      onRefreshPeriodChange={onRefreshPeriodChange}
      background={background}
      bordered={bordered}
      titled={titled}
      font={font}
      theme={theme}
      setTheme={setTheme}
      hideParameters={hideParameters}
      downloadsEnabled={downloadsEnabled}
      autoScrollToDashcardId={autoScrollToDashcardId}
      reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
      cardTitled={cardTitled}
      getClickActionMode={getClickActionMode}
      withFooter={withFooter}
      {...reduxProps}
    >
      {children}
    </ConnectedDashboardContextWithReduxProps>
  );
};
