const mockOpen = jest.fn().mockResolvedValue(undefined);

jest.mock("metabase/utils/dom", () => {
  const actual = jest.requireActual("metabase/utils/dom");
  return {
    ...actual,
    open: (...args: unknown[]) => mockOpen(...args),
  };
});

import MetabaseSettings from "metabase/utils/settings";
import type { UrlClickAction } from "metabase/visualizations/types";

import { performAction } from "./action";

describe("performAction URL actions with linkTarget", () => {
  beforeEach(() => {
    mockOpen.mockClear();
    MetabaseSettings.set("site-url", "http://localhost/");
  });

  it("passes linkTarget through to open()", () => {
    const action: UrlClickAction = {
      buttonType: "horizontal",
      name: "click_behavior",
      section: "auto",
      url: () => "/question/1",
      linkTarget: "_blank",
    };

    const extraProps = {
      dispatch: jest.fn(),
      onChangeCardAndRun: jest.fn(),
      onUpdateQuestion: jest.fn(),
    };

    expect(performAction(action, extraProps)).toBe(true);

    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ linkTarget: "_blank" }),
    );
  });

  it("passes ignoreSiteUrl and linkTarget together when both are set", () => {
    const action: UrlClickAction = {
      buttonType: "horizontal",
      name: "click_behavior",
      section: "auto",
      url: () => "https://example.com/x",
      ignoreSiteUrl: true,
      linkTarget: "_self",
    };

    performAction(action, {
      dispatch: jest.fn(),
      onChangeCardAndRun: jest.fn(),
      onUpdateQuestion: jest.fn(),
    });

    expect(mockOpen).toHaveBeenCalledWith(
      "https://example.com/x",
      expect.objectContaining({
        ignoreSiteUrl: true,
        linkTarget: "_self",
      }),
    );
  });
});
