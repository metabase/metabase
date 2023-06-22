import { UrlClickAction } from "metabase/modes/types";
import { performAction } from "./action";

describe("performAction", () => {
  it('should redirect to url using router if "forceSameOrigin" has passed', () => {
    const action: UrlClickAction = {
      buttonType: "horizontal",
      name: "automatic-insights",
      section: "auto",
      url: jest.fn(() => "/some/url"),
      forceSameOrigin: true,
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
            pathname: "/undefined/some/url",
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
