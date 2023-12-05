import MetabaseSettings from "metabase/lib/settings";
import type { UrlClickAction } from "metabase/visualizations/types";
import { performAction } from "./action";

describe("performAction", () => {
  it('should redirect using router if a "relative" url has been passed', () => {
    MetabaseSettings.set("site-url", "http://localhost");
    const action: UrlClickAction = {
      buttonType: "horizontal",
      name: "automatic-insights",
      section: "auto",
      url: jest.fn(() => "auto/dashboard/adhoc/123Abc"),
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
            pathname: "/auto/dashboard/adhoc/123Abc",
            query: {},
            search: "",
          },
        ],
        method: "push",
      },
      type: "@@router/CALL_HISTORY_METHOD",
    });
  });

  it("should redirect using router when deploying on subpath", () => {
    MetabaseSettings.set("site-url", "http://localhost/metabase/");
    const action: UrlClickAction = {
      buttonType: "horizontal",
      name: "automatic-insights",
      section: "auto",
      url: jest.fn(() => "auto/dashboard/adhoc/123Abc"),
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
            pathname: "/auto/dashboard/adhoc/123Abc",
            query: {},
            search: "",
          },
        ],
        method: "push",
      },
      type: "@@router/CALL_HISTORY_METHOD",
    });
  });

  it("should redirect using router when deploying on subpath with absolute URL", () => {
    MetabaseSettings.set("site-url", "http://localhost/metabase/");
    const action: UrlClickAction = {
      buttonType: "horizontal",
      name: "automatic-insights",
      section: "auto",
      url: jest.fn(
        () => "http://localhost/metabase/auto/dashboard/adhoc/123Abc",
      ),
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
            pathname: "/auto/dashboard/adhoc/123Abc",
            query: {},
            search: "",
          },
        ],
        method: "push",
      },
      type: "@@router/CALL_HISTORY_METHOD",
    });
  });

  it("should redirect with invalid URL", () => {
    MetabaseSettings.set("site-url", "http://localhost/metabase/");
    const action: UrlClickAction = {
      buttonType: "horizontal",
      name: "automatic-insights",
      section: "auto",
      url: jest.fn(
        () =>
          "invalid_protocol://localhost/metabase/auto/dashboard/adhoc/123Abc",
      ),
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
            pathname:
              "/invalid_protocol://localhost/metabase/auto/dashboard/adhoc/123Abc",
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
