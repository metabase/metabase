import {
  getCustomVizRenderFeedbackAttemptKey,
  getCustomVizRenderFeedbackKey,
  getCustomVizRenderFeedbackPrompt,
  normalizeCustomVizRenderError,
} from "./custom-viz-render-feedback";

describe("custom-viz render feedback", () => {
  const plugin = {
    id: 4,
    identifier: "reviews-by-stars",
    display_name: "Reviews by Star Rating",
    icon: null,
    bundle_url: "/api/ee/custom-viz-plugin/4/bundle",
    bundle_hash: "abc123",
    manifest: null,
  };

  it("formats render failures with plugin metadata and sandbox guidance", () => {
    const error = new Error("[plugin 4] blocked createElement: input");
    error.stack = "Error: [plugin 4] blocked createElement: input\n  at mount";

    const utils = getCustomVizRenderFeedbackPrompt({
      agentId: "omnibot",
      display: "custom:reviews-by-stars",
      questionName: "Reviews by Star Rating",
      path: "/question#abc",
      plugin,
      error,
      context: { phase: "render", display: "custom:reviews-by-stars" },
    });

    expect(utils).toContain("Custom visualization render feedback: failed.");
    expect(utils).toContain("- phase: render");
    expect(utils).toContain("- plugin id: 4");
    expect(utils).toContain(
      "- error message: [plugin 4] blocked createElement: input",
    );
    expect(utils).toContain("Avoid blocked DOM operations");
    expect(utils).toContain("input");
  });

  it("creates stable keys for duplicate suppression and attempt limits", () => {
    const details = {
      agentId: "omnibot",
      display: "custom:reviews-by-stars",
      questionName: "Reviews by Star Rating",
      path: "/question#abc",
      plugin,
      error: new Error("boom"),
      context: { phase: "render" as const },
    };

    expect(getCustomVizRenderFeedbackKey(details)).toBe(
      getCustomVizRenderFeedbackKey(details),
    );
    expect(getCustomVizRenderFeedbackAttemptKey(details)).toBe(
      "omnibot:custom:reviews-by-stars",
    );
  });

  it("normalizes unknown errors", () => {
    expect(normalizeCustomVizRenderError("boom")).toEqual({
      name: "Error",
      message: "boom",
    });
    expect(normalizeCustomVizRenderError({ message: "boom" })).toEqual({
      name: "Error",
      message: '{"message":"boom"}',
    });
  });
});
