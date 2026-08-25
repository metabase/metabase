import { resolveQuestionId } from "./utils";

describe("resolveQuestionId", () => {
  it("returns 'new-native' for a native card hash with no slug", () => {
    expect(
      resolveQuestionId(undefined, {
        dataset_query: { type: "native" },
      }),
    ).toBe("new-native");
  });

  it("returns null for a structured (MBQL) card hash with no slug", () => {
    expect(
      resolveQuestionId(undefined, {
        dataset_query: { type: "query" },
      }),
    ).toBeNull();
  });

  it("returns numeric ID for a saved question slug", () => {
    expect(
      resolveQuestionId("109-days-when-orders-were-added", undefined),
    ).toBe(109);
  });

  it("returns null when there is no slug and no deserialized card", () => {
    expect(resolveQuestionId(undefined, undefined)).toBeNull();
  });

  it("numeric slug takes precedence over a native card", () => {
    expect(
      resolveQuestionId("42-my-question", {
        dataset_query: { type: "native" },
      }),
    ).toBe(42);
  });
});
