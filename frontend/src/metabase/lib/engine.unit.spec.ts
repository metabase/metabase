import { getEngineNativeAceMode } from "metabase/lib/engine";

describe("getEngineNativeAceMode", () => {
  it("should be SQL mode for H2", () => {
    expect(getEngineNativeAceMode("h2")).toBe("ace/mode/sql");
  });

  it("should be JSON for MongoDB", () => {
    expect(getEngineNativeAceMode("mongo")).toBe("ace/mode/json");
  });
});
