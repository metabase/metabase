import type { ComponentType, PropsWithChildren } from "react";
import { noop } from "underscore";

import {
  DashboardContext,
  type DashboardContextErrorState,
  type DashboardContextOwnProps,
  type DashboardContextOwnResult,
  type DashboardContextProps,
  type DashboardControls,
} from "metabase/dashboard/context";
import {
  type ReduxProps,
  mapDispatchToProps,
  mapStateToProps,
} from "metabase/dashboard/context/context.redux";
import { connect } from "metabase/lib/redux";

export type MockDashboardContextProps = DashboardContextProps &
  Partial<ReduxProps> &
  Partial<DashboardContextErrorState>;

// Create a component that accepts all redux props and passes them into DashboardContext
const DashboardContextWithReduxProps = (
  props: PropsWithChildren<
    ReduxProps &
      DashboardContextOwnProps &
      DashboardContextOwnResult &
      DashboardControls
  >,
) => (
  <DashboardContext.Provider value={{ error: null, ...props }}>
    {props.children}
  </DashboardContext.Provider>
);

const ConnectedDashboardContextWithReduxProps = connect(
  mapStateToProps,
  mapDispatchToProps,
  (stateProps, dispatchProps, ownProps) =>
    // this is a bit of a hack to get the types to agree (since overridden functions of mapDispatch might
    // have the correct type) and we have bigger fish to fry. so we can come back to this
    ({
      ...stateProps,
      ...dispatchProps,
      ...ownProps,
    }) as unknown as ReduxProps &
      DashboardContextOwnProps &
      DashboardContextOwnResult &
      DashboardControls,
)(DashboardContextWithReduxProps) as ComponentType<
  PropsWithChildren<
    MockDashboardContextProps & DashboardContextOwnResult & Partial<ReduxProps>
  >
>;

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
      dashboardIdProp={dashboardId}
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
