import { trackEvent } from "metabase/store";
import MetabaseAnalytics from "metabase/lib/analytics";

jest.mock("metabase/lib/analytics", () => ({
  trackEvent: jest.fn(),
}));

// fake next for redux
const next = jest.fn();

describe("store", () => {
  describe("trackEvent", () => {
    beforeEach(() => {
      jest.resetAllMocks();
    });
    it("should call MetabaseAnalytics with the proper custom values", () => {
      const testAction = {
        type: "metabase/test/ACTION_NAME",
        meta: {
          analytics: {
            category: "cool",
            action: "action",
            label: "labeled",
            value: "value",
          },
        },
      };

      trackEvent({})(next)(testAction);
      expect(MetabaseAnalytics.trackEvent).toHaveBeenCalledTimes(1);
      expect(MetabaseAnalytics.trackEvent).toHaveBeenCalledWith(
        "cool",
        "action",
        "labeled",
        "value",
      );
    });
    it("should ignore actions if ignore is true", () => {
      const testAction = {
        type: "metabase/test/ACTION_NAME",
        meta: {
          analytics: {
            ignore: true,
          },
        },
      };

      trackEvent({})(next)(testAction);
      expect(MetabaseAnalytics.trackEvent).toHaveBeenCalledTimes(0);
    });

    it("should use the action name if no analytics action is present", () => {
      const testAction = {
        type: "metabase/test/ACTION_NAME",
      };

      trackEvent({})(next)(testAction);
      expect(MetabaseAnalytics.trackEvent).toHaveBeenCalledWith(
        "test",
        "ACTION_NAME",
      );
    });
  });
});
