import { isSmallScreen } from "metabase/lib/dom";

export const MAXIMUM_PARAMETERS_FOR_STICKINESS = 5;

// Dashboard Filters should always be sticky, except the case with small screen:
// if more than MAXIMUM_PARAMETERS_FOR_STICKINESS parameters exist, we do not stick them to avoid
// taking to much space on the screen
export const updateParametersWidgetStickiness = dashboard => {
  const shouldBeSticky = checkIfParametersWidgetShouldBeSticky(dashboard);
  const shouldToggleStickiness =
    dashboard.state.isParametersWidgetSticky !== shouldBeSticky;

  if (shouldToggleStickiness) {
    dashboard.setState({
      isParametersWidgetSticky: shouldBeSticky,
    });
  }
};

const checkIfParametersWidgetShouldBeSticky = dashboard =>
  !(
    dashboard.state.parametersListLength > MAXIMUM_PARAMETERS_FOR_STICKINESS &&
    isSmallScreen()
  );
