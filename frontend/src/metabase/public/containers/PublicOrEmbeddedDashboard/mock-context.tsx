import type { ComponentType, PropsWithChildren } from "react";
import { noop } from "underscore";

import {
  DashboardContext,
  type DashboardContextOwnProps,
  type DashboardContextReturned,
} from "metabase/dashboard/context";
import {
  mapDispatchToProps,
  mapStateToProps,
} from "metabase/dashboard/context/context.redux";
import { connect } from "metabase/lib/redux";

export type MockDashboardContextProps = Partial<
  Omit<PropsWithChildren<DashboardContextReturned>, "dashboardActions"> & {
    dashboardActions: DashboardContextOwnProps["dashboardActions"];
  }
>;
// Create a component that accepts all redux props and passes them into DashboardContext
const DashboardContextWithReduxProps = (
  props: PropsWithChildren<DashboardContextReturned>,
) => {
  const {
    isEditing,
    downloadsEnabled,
    withSubscriptions,
    dashboardActions: dashboardActionsOrGetter,
  } = props;

  // Use exact same implementation as in DashboardContextProviderInner
  const dashboardActions =
    typeof dashboardActionsOrGetter === "function"
      ? dashboardActionsOrGetter({
          isEditing,
          downloadsEnabled,
          withSubscriptions,
        })
      : (dashboardActionsOrGetter ?? null);

  return (
    <DashboardContext.Provider value={{ ...props, dashboardActions }}>
      {props.children}
    </DashboardContext.Provider>
  );
};

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
    }) as unknown as DashboardContextReturned,
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
  dashboardId = 1,
  parameterQueryParams,
  onLoad,
  onError,
  navigateToNewCardFromDashboard = null,
  background = true,
  bordered = true,
  titled = true,
  font = null,
  theme = "light",
  hideParameters = null,
  downloadsEnabled = { pdf: true, results: true },
  autoScrollToDashcardId = undefined,
  reportAutoScrolledToDashcard = noop,
  cardTitled = true,
  getClickActionMode = undefined,
  withFooter = true,
  isFullscreen = false,
  dashboardActions = undefined,
  dashcardMenu = undefined,
  ...reduxProps
}: PropsWithChildren<MockDashboardContextProps>) => {
  return (
    <ConnectedDashboardContextWithReduxProps
      dashboardId={dashboardId}
      parameterQueryParams={parameterQueryParams}
      onLoad={onLoad}
      onError={onError}
      isFullscreen={isFullscreen}
      navigateToNewCardFromDashboard={navigateToNewCardFromDashboard}
      background={background}
      bordered={bordered}
      titled={titled}
      font={font}
      theme={theme}
      hideParameters={hideParameters}
      downloadsEnabled={downloadsEnabled}
      autoScrollToDashcardId={autoScrollToDashcardId}
      reportAutoScrolledToDashcard={reportAutoScrolledToDashcard}
      cardTitled={cardTitled}
      getClickActionMode={getClickActionMode}
      withFooter={withFooter}
      dashboardActions={dashboardActions}
      dashcardMenu={dashcardMenu}
      {...reduxProps}
    >
      {children}
    </ConnectedDashboardContextWithReduxProps>
  );
};
