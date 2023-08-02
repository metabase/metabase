import { isSmallScreen, getMainElement } from "metabase/lib/dom";

export const MAXIMUM_PARAMETERS_FOR_STICKINESS = 6;

export const updateParametersWidgetStickiness = dashboard => {
  const shouldBeSticky = checkIfParametersWidgetShouldBeSticky(dashboard);

  const shouldToggleStickiness = checkIfShouldToggleStickiness(
    dashboard,
    shouldBeSticky,
  );

  if (shouldToggleStickiness) {
    dashboard.setState({
      isParametersWidgetSticky: shouldBeSticky,
    });
  }
};

const checkIfShouldToggleStickiness = (dashboard, shouldBeSticky) => {
  const { isParametersWidgetSticky } = dashboard.state;

  return shouldBeSticky !== isParametersWidgetSticky;
};

const checkIfDeviceShouldDisplayStickyFilters = dashboard =>
  !(
    dashboard.state.parametersListLength > MAXIMUM_PARAMETERS_FOR_STICKINESS &&
    isSmallScreen()
  );

const checkIfParametersWidgetShouldBeSticky = dashboard => {
  const deviceShouldDisplayStickyFilters =
    checkIfDeviceShouldDisplayStickyFilters(dashboard);

  if (!deviceShouldDisplayStickyFilters) {
    return false;
  }

  const offsetTop = getOffsetTop(dashboard);

  return getMainElement().scrollTop > offsetTop;
};

const getOffsetTop = dashboard => {
  const parametersWidget = dashboard.parametersWidgetRef.current;

  if (parametersWidget) {
    return parametersWidget.offsetTop;
  } else {
    return 0;
  }
};
