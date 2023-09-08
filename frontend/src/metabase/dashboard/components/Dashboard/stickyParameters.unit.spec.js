import * as domUtils from "metabase/lib/dom";
import {
  MAXIMUM_PARAMETERS_FOR_STICKINESS,
  updateParametersWidgetStickiness,
} from "./stickyParameters";

const offsetTop = 100;

function mockMainElementScroll(scrollTop) {
  const fakeMainElement = { scrollTop };
  document.getElementsByTagName = () => [fakeMainElement];
}

function simulateSmallScreen() {
  jest.spyOn(domUtils, "isSmallScreen").mockReturnValue(true);
}

describe("updateParametersWidgetStickiness", () => {
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
      },
      setState,
    };

    updateParametersWidgetStickiness(dashboard);

    expect(setState).not.toHaveBeenCalled();
  });

  describe("on small device", () => {
    beforeEach(() => {
      simulateSmallScreen();
    });

    it("makes filters not sticky if too many parameters", () => {
      const setState = jest.fn();

      mockMainElementScroll(offsetTop + 1);

      const dashboard = {
        parametersWidgetRef: { current: { offsetTop } },
        state: {
          isParametersWidgetSticky: false,
          parametersListLength: MAXIMUM_PARAMETERS_FOR_STICKINESS + 1,
        },
        setState,
      };

      updateParametersWidgetStickiness(dashboard);

      expect(setState).not.toHaveBeenCalled();
    });

    it("makes filters sticky if not too many parameters", () => {
      const setState = jest.fn();

      mockMainElementScroll(offsetTop + 1);

      const dashboard = {
        parametersWidgetRef: { current: { offsetTop } },
        state: {
          isParametersWidgetSticky: false,
          parametersListLength: MAXIMUM_PARAMETERS_FOR_STICKINESS,
        },
        setState,
      };

      updateParametersWidgetStickiness(dashboard);

      expect(setState).toHaveBeenCalledWith({
        isParametersWidgetSticky: true,
      });
    });
  });
});
