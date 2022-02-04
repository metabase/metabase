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

const checkIfParametersWidgetShouldBeSticky = dashboard => {
  const offsetTop =
    dashboard.state.parametersWidgetOffsetTop ||
    dashboard.parametersWidgetRef.offsetTop;

  return window.scrollY >= offsetTop;
};

const updateParametersAndCardsContainerStyle = (dashboard, shouldBeSticky) => {
  const { offsetHeight } = dashboard.parametersWidgetRef;

  const paddingTop = shouldBeSticky ? offsetHeight + "px" : "0";

  dashboard.parametersAndCardsContainerRef.style.paddingTop = paddingTop;
};
