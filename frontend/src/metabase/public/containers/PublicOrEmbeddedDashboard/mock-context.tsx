import type { ComponentType, PropsWithChildren } from "react";
import { noop } from "underscore";

import {
  type ContextReturned,
  DashboardContext,
} from "metabase/dashboard/context";
import {
  mapDispatchToProps,
  mapStateToProps,
} from "metabase/dashboard/context/context.redux";
import { connect } from "metabase/lib/redux";

// The props that can be passed to override any part of ContextReturned
// Redux props are optional since they're provided by the connector
export type MockDashboardContextProps = Partial<
  PropsWithChildren<ContextReturned>
>;

// This component receives all props (own + redux) and passes them to the provider
const DashboardContextWithReduxProps = (
  props: PropsWithChildren<ContextReturned>,
) => (
  <DashboardContext.Provider value={props}>
    {props.children}
  </DashboardContext.Provider>
);

const ConnectedDashboardContextWithReduxProps = connect(
  mapStateToProps,
  mapDispatchToProps,
  (stateProps, dispatchProps, ownProps) =>
    ({
      ...stateProps,
      ...dispatchProps,
      ...ownProps,
    }) as unknown as ContextReturned,
)(DashboardContextWithReduxProps) as ComponentType<MockDashboardContextProps>;

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
  // Required fields from DashboardContextOwnResult
  shouldRenderAsNightMode = false,
  initialDashboardId,
  dashboardId,
  // Required fields from DashboardContextOwnProps (except dashboardId)
  parameterQueryParams = {},
  onLoad = noop,
  onError = noop,
  onLoadWithoutCards = noop,
  navigateToNewCardFromDashboard = null,
  // Required fields from DashboardControls
  background = true,
  bordered = true,
  titled = true,
  font = null,
  hideParameters = null,
  downloadsEnabled = { pdf: true, results: true },
  autoScrollToDashcardId = undefined,
  reportAutoScrolledToDashcard = noop,
  cardTitled = true,
  getClickActionMode = undefined,
  withFooter = true,
  // Required fields from DashboardContextErrorState
  error = null,
  // Required fields from DashboardFullscreenControls
  isFullscreen = false,
  onFullscreenChange = noop,
  fullscreenRef = noop,
  // Required fields from DashboardRefreshPeriodControls
  refreshPeriod = null,
  onRefreshPeriodChange = noop,
  setRefreshElapsedHook = noop,
  // Required fields from EmbedThemeControls
  hasNightModeToggle = false,
  onNightModeChange = noop,
  isNightMode = false,
  theme = "light",
  setTheme = noop,
  ...reduxProps
}: MockDashboardContextProps) => (
  <ConnectedDashboardContextWithReduxProps
    shouldRenderAsNightMode={shouldRenderAsNightMode}
    initialDashboardId={initialDashboardId}
    dashboardId={dashboardId}
    parameterQueryParams={parameterQueryParams}
    onLoad={onLoad}
    onError={onError}
    onLoadWithoutCards={onLoadWithoutCards}
    navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
    background={background}
    bordered={bordered}
    titled={titled}
    font={font}
    hideParameters={hideParameters}
    downloadsEnabled={downloadsEnabled}
    autoScrollToDashcardId={autoScrollToDashcardId}
    reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
    cardTitled={cardTitled}
    getClickActionMode={getClickActionMode}
    withFooter={withFooter}
    error={error}
    isFullscreen={isFullscreen}
    onFullscreenChange={onFullscreenChange}
    fullscreenRef={fullscreenRef}
    refreshPeriod={refreshPeriod}
    onRefreshPeriodChange={onRefreshPeriodChange}
    setRefreshElapsedHook={setRefreshElapsedHook}
    hasNightModeToggle={hasNightModeToggle}
    onNightModeChange={onNightModeChange}
    isNightMode={isNightMode}
    theme={theme}
    setTheme={setTheme}
    {...reduxProps}
  >
    {children}
  </ConnectedDashboardContextWithReduxProps>
);
