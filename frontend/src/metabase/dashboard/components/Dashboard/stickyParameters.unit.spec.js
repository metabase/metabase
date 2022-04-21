import {
  MAXIMUM_PARAMETERS_FOR_STICKINESS,
  updateParametersWidgetStickiness,
} from "./stickyParameters";

const parametersListShort = Array(MAXIMUM_PARAMETERS_FOR_STICKINESS);
const parametersListLong = Array(MAXIMUM_PARAMETERS_FOR_STICKINESS * 2);

function mockMainElementScroll(scrollTop) {
  const fakeMainElement = { scrollTop };
  document.getElementsByTagName = () => [fakeMainElement];
}

it("initializes parametersWidgetOffsetTop", () => {
  const offsetTop = 100;
  const setState = jest.fn();

  mockMainElementScroll(0);

  const dashboard = {
    parametersWidgetRef: { offsetTop },
    parametersAndCardsContainerRef: { style: {} },
    state: {},
    setState,
  };

  updateParametersWidgetStickiness(dashboard);

  expect(setState).toHaveBeenCalledWith({
    parametersWidgetOffsetTop: offsetTop,
  });
});

it("should not make the filters sticky", () => {
  const offsetTop = 100;
  const setState = jest.fn();

  mockMainElementScroll(offsetTop + 1);

  const dashboard = {
    parametersWidgetRef: { offsetTop },
    parametersAndCardsContainerRef: { style: {} },
    state: {
      parametersList: parametersListLong,
    },
    setState,
  };

  updateParametersWidgetStickiness(dashboard);

  expect(setState).toHaveBeenCalledWith({
    isParametersWidgetSticky: false,
  });
});

it("makes filters sticky with enough scrolling down", () => {
  const offsetTop = 100;
  const setState = jest.fn();

  mockMainElementScroll(offsetTop + 1);

  const dashboard = {
    parametersWidgetRef: { offsetTop },
    parametersAndCardsContainerRef: { style: {} },
    state: {
      parametersList: parametersListShort,
    },
    setState,
  };

  updateParametersWidgetStickiness(dashboard);

  expect(setState).toHaveBeenCalledWith({
    isParametersWidgetSticky: true,
  });
});

it("makes filters unsticky with enough scrolling up", () => {
  const offsetTop = 100;
  const setState = jest.fn();

  mockMainElementScroll(offsetTop - 1);

  const dashboard = {
    parametersWidgetRef: { offsetTop },
    parametersAndCardsContainerRef: { style: {} },
    state: {
      parametersList: parametersListShort,
    },
    setState,
  };

  updateParametersWidgetStickiness(dashboard);

  expect(setState).toHaveBeenCalledWith({
    isParametersWidgetSticky: false,
  });
});

it("keeps filters sticky with enough scrolling down and already sticky", () => {
  const offsetTop = 100;
  const setState = jest.fn();

  mockMainElementScroll(offsetTop + 1);

  const dashboard = {
    parametersWidgetRef: { offsetTop },
    parametersAndCardsContainerRef: { style: {} },
    state: {
      isParametersWidgetSticky: true,
      parametersWidgetOffsetTop: 100,
      parametersList: parametersListShort,
    },
    setState,
  };

  updateParametersWidgetStickiness(dashboard);

  expect(setState).not.toHaveBeenCalled();
});

it("keeps filters not sticky with enough scrolling up and already not sticky", () => {
  const offsetTop = 100;
  const setState = jest.fn();

  mockMainElementScroll(offsetTop - 1);

  const dashboard = {
    parametersWidgetRef: { offsetTop },
    parametersAndCardsContainerRef: { style: {} },
    state: {
      isParametersWidgetSticky: false,
      parametersWidgetOffsetTop: 100,
      parametersList: parametersListShort,
    },
    setState,
  };

  updateParametersWidgetStickiness(dashboard);

  expect(setState).not.toHaveBeenCalled();
});
