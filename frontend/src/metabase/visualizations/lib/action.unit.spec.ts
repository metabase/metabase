import type { UrlClickAction } from "metabase/visualizations/types";
import { performAction } from "./action";

describe("performAction", () => {
  it('should redirect using router if a "relative" url has been passed', () => {
    const action: UrlClickAction = {
      buttonType: "horizontal",
      name: "automatic-insights",
      section: "auto",
      url: jest.fn(() => "auto/dashboard/adhoc/123"),
    };

    const extraProps = {
      dispatch: jest.fn(),
      onChangeCardAndRun: jest.fn(),
    };

    expect(performAction(action, extraProps)).toBe(true);

    expect(action.url).toHaveBeenCalledTimes(1);

    expect(extraProps.dispatch).toHaveBeenCalledTimes(2);
    expect(extraProps.dispatch).toHaveBeenCalledWith({
      payload: {
        args: [
          {
            hash: "",
            pathname: "/auto/dashboard/adhoc/123",
            query: {},
            search: "",
          },
        ],
        method: "push",
      },
      type: "@@router/CALL_HISTORY_METHOD",
    });
  });
});
