import {
  isSmallScreen,
  getHeaderElement,
  getMainElement,
} from "metabase/lib/dom";

export const MAXIMUM_PARAMETERS_FOR_STICKINESS = 6;

export const updateParametersWidgetStickiness = dashboard => {
  initializeWidgetOffsetTop(dashboard);

  const shouldBeSticky = checkIfParametersWidgetShouldBeSticky(dashboard);

  const shouldToggleStickiness = checkIfShouldToggleStickiness(
    dashboard,
    shouldBeSticky,
  );

  if (shouldToggleStickiness) {
    updateParametersAndCardsContainerStyle(dashboard, shouldBeSticky);

    dashboard.setState({
      isParametersWidgetSticky: shouldBeSticky,
    });
  }
};

const initializeWidgetOffsetTop = dashboard => {
  if (!dashboard.state.parametersWidgetOffsetTop) {
    dashboard.setState({
      parametersWidgetOffsetTop: dashboard.parametersWidgetRef.offsetTop,
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
  const deviceShouldDisplayStickyFilters = checkIfDeviceShouldDisplayStickyFilters(
    dashboard,
  );

  if (!deviceShouldDisplayStickyFilters) {
    return false;
  }

  const { isNavbarOpen } = dashboard.props;

  const offsetTop = getOffsetTop(dashboard);

  // If AppNavBar is open,
  // we make the ParametersWidget sticky below the header.
  //
  // Otherwise, we'd have to make the AppNavBar height
  // responsive, so it gets progressively more complicated
  // in a situation where the user is more likely to be
  // navigation around the application than to be focusing on
  // the Dashboard parameters.
  const headerHeight = isNavbarOpen ? 0 : getHeaderHeight();

  return getMainElement().scrollTop - headerHeight >= offsetTop;
};

const updateParametersAndCardsContainerStyle = (dashboard, shouldBeSticky) => {
  const { offsetHeight } = dashboard.parametersWidgetRef;

  const paddingTop = shouldBeSticky ? offsetHeight + "px" : "0";

  dashboard.parametersAndCardsContainerRef.style.paddingTop = paddingTop;
};

const getOffsetTop = dashboard =>
  dashboard.state.parametersWidgetOffsetTop ||
  dashboard.parametersWidgetRef.offsetTop;

const getHeaderHeight = () => getHeaderElement().offsetHeight;
