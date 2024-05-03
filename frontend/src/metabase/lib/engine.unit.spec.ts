import {
  getEngineNativeAceMode,
  getEngineNativeType,
  getNativeQueryLanguage,
} from "metabase/lib/engine";

describe("getEngineNativeAceMode", () => {
  it("should be SQL when engine is undefined", () => {
    expect(getEngineNativeAceMode()).toBe("ace/mode/sql");
  });

  it("should be SQL mode for H2", () => {
    expect(getEngineNativeAceMode("h2")).toBe("ace/mode/sql");
  });

  it("should be JSON for MongoDB", () => {
    expect(getEngineNativeAceMode("mongo")).toBe("ace/mode/json");
  });
});

describe("getEngineNativeType", () => {
  it("should be sql when engine is undefined", () => {
    expect(getEngineNativeType()).toBe("sql");
  });

  it("should be sql for Postgres", () => {
    expect(getEngineNativeType("postgres")).toBe("sql");
  });

  it("should be json for Druid or MongoDB", () => {
    expect(getEngineNativeType("druid")).toBe("json");
    expect(getEngineNativeType("mongo")).toBe("json");
  });
});

describe("getNativeQueryLanguage", () => {
  it("should be SQL when engine is undefined", () => {
    expect(getNativeQueryLanguage()).toBe("SQL");
  });

  it("should be SQL for Postgres", () => {
    expect(getNativeQueryLanguage("postgres")).toBe("SQL");
  });

  it("should be JSON for Druid or MongoDB", () => {
    expect(getNativeQueryLanguage("druid")).toBe("JSON");
    expect(getNativeQueryLanguage("mongo")).toBe("JSON");
  });
});
