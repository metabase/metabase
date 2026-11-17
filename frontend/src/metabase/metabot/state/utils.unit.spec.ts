import { getServerErrorDisplay } from "./utils";

describe("getServerErrorDisplay", () => {
  it.each([
    "ai_usage_limit_reached",
    "ai_provider_billing",
    "ai_provider_rate_limit",
    "ai_provider_auth",
    "ai_provider_unavailable",
    "ai_provider_context_full",
  ])("shows the server message for %s", (type) => {
    expect(getServerErrorDisplay({ type, message: "copy" })).toEqual({
      type: "message",
      message: "copy",
    });
  });

  it("shows nothing for an unknown code", () => {
    expect(
      getServerErrorDisplay({
        type: "java.lang.RuntimeException",
        message: "boom",
      }),
    ).toBeUndefined();
  });

  it("shows nothing without a message", () => {
    expect(
      getServerErrorDisplay({ type: "ai_provider_context_full" }),
    ).toBeUndefined();
  });
});
