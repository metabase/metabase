import {
  getEngineNativeAceMode,
  getEngineNativeType,
  getNativeQueryLanguage,
  formatNativeQuery,
  isDeprecatedEngine,
} from "metabase/lib/engine";
import type { Engine } from "metabase-types/api";

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

describe("formatNativeQuery", () => {
  it("should return `undefined` when neither query nor engine are provided", () => {
    expect(formatNativeQuery()).toBeUndefined();
  });

  it("should return `undefined` when the query exists, but engine is `undefined`", () => {
    expect(formatNativeQuery("")).toBeUndefined();
    expect(formatNativeQuery("select 1")).toBeUndefined();

    expect(formatNativeQuery({})).toBeUndefined();
    expect(formatNativeQuery([])).toBeUndefined();
    expect(formatNativeQuery([{}, { a: 1 }])).toBeUndefined();
  });

  it("should return `undefined` when the query exists, but engine is an empty string", () => {
    expect(formatNativeQuery("", "")).toBeUndefined();
    expect(formatNativeQuery("select 1", "")).toBeUndefined();

    expect(formatNativeQuery({}, "")).toBeUndefined();
    expect(formatNativeQuery([], "")).toBeUndefined();
    expect(formatNativeQuery([{}, { a: 1 }], "")).toBeUndefined();
  });

  it("should return `undefined` when engine is passed as the only argument", () => {
    // Because parameters are positional, passing an engine as the only argument
    // will be treated as a query, and the engine will be `undefined`.
    expect(formatNativeQuery("mongo")).toBeUndefined();
    expect(formatNativeQuery("postgres")).toBeUndefined();

    expect(formatNativeQuery("mongo", "")).toBeUndefined();
    expect(formatNativeQuery("postgres", "")).toBeUndefined();
  });

  it("should return `undefined` when the query and the engine don't match", () => {
    expect(formatNativeQuery("select 1", "mongo")).toBeUndefined();
    expect(formatNativeQuery("foo bar baz", "mongo")).toBeUndefined();
    expect(formatNativeQuery("", "mongo")).toBeUndefined();

    expect(formatNativeQuery({}, "postgres")).toBeUndefined();
    expect(formatNativeQuery([], "postgres")).toBeUndefined();
    expect(formatNativeQuery([{}], "postgres")).toBeUndefined();
    expect(formatNativeQuery({ a: 1 }, "postgres")).toBeUndefined();
    expect(formatNativeQuery([{ a: 1 }], "postgres")).toBeUndefined();
  });

  it("should return formatted SQL", () => {
    expect(formatNativeQuery("select 1", "postgres")).toEqual("select 1");
    expect(
      formatNativeQuery("SELECT * FROM PUBLIC.ORDERS", "postgres"),
    ).toEqual("SELECT *\nFROM PUBLIC.ORDERS");
  });

  it("should return any valid string if the engine type is sql", () => {
    expect(formatNativeQuery("foo", "postgres")).toEqual("foo");
    expect(formatNativeQuery("FOO BAR baz", "postgres")).toEqual("FOO BAR baz");
    expect(formatNativeQuery("FOO: BAR, baz.", "postgres")).toEqual(
      "FOO: BAR, baz.",
    );
    expect(formatNativeQuery("-- foo", "postgres")).toEqual("-- foo");
  });

  it("should return formatted JSON", () => {
    expect(formatNativeQuery({}, "mongo")).toEqual("{}");
    expect(formatNativeQuery([], "mongo")).toEqual("[]");
    expect(formatNativeQuery(["foo"], "mongo")).toEqual('[\n  "foo"\n]');
    expect(formatNativeQuery({ a: 1 }, "mongo")).toEqual('{\n  "a": 1\n}');
  });
});

describe("isDeprecatedEngine", () => {
  const engines: Record<string, Engine> = {
    foo: {
      "driver-name": "Foo",
      source: { type: "official", contact: null },
      "superseded-by": "deprecated",
    },
    bar: {
      "driver-name": "Bar",
      source: { type: "official", contact: null },
      "superseded-by": "baz",
    },
    baz: {
      "driver-name": "Baz",
      source: { type: "official", contact: null },
      "superseded-by": null,
    },
  };

  it("should be true for a deprecated engine", () => {
    expect(isDeprecatedEngine(engines, "foo")).toBe(true);
    expect(isDeprecatedEngine(engines, "bar")).toBe(true);
  });

  it("should be false for an engine that's not deprecated", () => {
    expect(isDeprecatedEngine(engines, "baz")).toBe(false);
  });

  it("should be false if an engine doesn't exist", () => {
    expect(isDeprecatedEngine(engines, "buzzzzz")).toBe(false);
  });
});
