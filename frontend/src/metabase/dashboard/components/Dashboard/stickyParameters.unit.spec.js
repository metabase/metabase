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
  describe("on small screen", () => {
    beforeEach(() => {
      simulateSmallScreen();
      mockMainElementScroll(offsetTop + 1);
    });

    it("keeps filters not sticky if filters number is > MAXIMUM_PARAMETERS_FOR_STICKINESS", () => {
      const setState = jest.fn();

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

    it("makes filters sticky if filters number is <= MAXIMUM_PARAMETERS_FOR_STICKINESS", () => {
      const setState = jest.fn();

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
