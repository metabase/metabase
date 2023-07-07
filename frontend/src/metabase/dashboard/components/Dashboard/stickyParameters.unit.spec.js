import { updateParametersWidgetStickiness } from "./stickyParameters";

const offsetTop = 100;

function mockMainElementScroll(scrollTop) {
  const fakeMainElement = { scrollTop };
  document.getElementsByTagName = () => [fakeMainElement];
}

describe("updateParametersWidgetStickiness", () => {
  it("initializes parametersWidgetOffsetTop", () => {
    const setState = jest.fn();

    mockMainElementScroll(0);

    const dashboard = {
      parametersWidgetRef: { current: { offsetTop } },
      state: {},
      setState,
    };

    updateParametersWidgetStickiness(dashboard);

    expect(setState).toHaveBeenCalledWith({
      parametersWidgetOffsetTop: offsetTop,
    });
  });

  it("do not initialize parametersWidgetOffsetTop if there's no parametersWidgetRef", () => {
    const setState = jest.fn();

    mockMainElementScroll(0);

    const dashboard = {
      parametersWidgetRef: { current: null },
      state: {},
      setState,
    };

    updateParametersWidgetStickiness(dashboard);

    expect(setState).toHaveBeenCalledTimes(0);
  });

  it("makes filters sticky with enough scrolling down", () => {
    const setState = jest.fn();

    mockMainElementScroll(offsetTop + 1);

    const dashboard = {
      parametersWidgetRef: { current: { offsetTop } },
      state: {},
      setState,
    };

    updateParametersWidgetStickiness(dashboard);

    expect(setState).toHaveBeenCalledWith({
      isParametersWidgetSticky: true,
    });
  });

  it("makes filters unsticky with enough scrolling up", () => {
    const setState = jest.fn();

    mockMainElementScroll(offsetTop - 1);

    const dashboard = {
      parametersWidgetRef: { current: { offsetTop } },
      state: {},
      setState,
    };

    updateParametersWidgetStickiness(dashboard);

    expect(setState).toHaveBeenCalledWith({
      isParametersWidgetSticky: false,
    });
  });

  it("keeps filters sticky with enough scrolling down and already sticky", () => {
    const setState = jest.fn();

    mockMainElementScroll(offsetTop + 1);

    const dashboard = {
      parametersWidgetRef: { current: { offsetTop } },
      state: {
        isParametersWidgetSticky: true,
        parametersWidgetOffsetTop: offsetTop,
      },
      setState,
    };

    updateParametersWidgetStickiness(dashboard);

    expect(setState).not.toHaveBeenCalled();
  });

  it("keeps filters not sticky with enough scrolling up and already not sticky", () => {
    const setState = jest.fn();

    mockMainElementScroll(offsetTop - 1);

    const dashboard = {
      parametersWidgetRef: { current: { offsetTop } },
      state: {
        isParametersWidgetSticky: false,
        parametersWidgetOffsetTop: offsetTop,
      },
      setState,
    };

    updateParametersWidgetStickiness(dashboard);

    expect(setState).not.toHaveBeenCalled();
  });
});
