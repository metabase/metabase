import {
  formatNativeQuery,
  getEngineNativeType,
  getNativeQueryLanguage,
  isDeprecatedEngine,
} from "metabase/lib/engine";
import type { Engine } from "metabase-types/api";

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
  it("should return formatted SQL", () => {
    expect(formatNativeQuery("select 1")).toEqual("select 1");
    expect(formatNativeQuery("SELECT * FROM PUBLIC.ORDERS")).toEqual(
      "SELECT * FROM PUBLIC.ORDERS",
    );
  });

  it("should return any valid string if the engine type is sql", () => {
    expect(formatNativeQuery("foo")).toEqual("foo");
    expect(formatNativeQuery("FOO BAR baz")).toEqual("FOO BAR baz");
    expect(formatNativeQuery("FOO: BAR, baz.")).toEqual("FOO: BAR, baz.");
    expect(formatNativeQuery("-- foo")).toEqual("-- foo");
  });

  it("should not format SQL keywords inside comment lines", () => {
    expect(
      formatNativeQuery(
        "-- SELECT * FROM products WHERE category = 'Widget'\nSELECT * FROM products WHERE category = 'Widget'",
      ),
    ).toEqual(
      "-- SELECT * FROM products WHERE category = 'Widget'\nSELECT * FROM products WHERE category = 'Widget'",
    );
  });

  it("should return formatted JSON", () => {
    expect(formatNativeQuery({})).toEqual("{}");
    expect(formatNativeQuery([])).toEqual("[]");
    expect(formatNativeQuery(["foo"])).toEqual('[\n  "foo"\n]');
    expect(formatNativeQuery({ a: 1 })).toEqual('{\n  "a": 1\n}');
    expect(formatNativeQuery('["foo"]')).toEqual('["foo"]');
  });
});

describe("isDeprecatedEngine", () => {
  const engines: Record<string, Engine> = {
    foo: {
      "driver-name": "Foo",
      source: { type: "official", contact: null },
      "superseded-by": "deprecated",
      "extra-info": null,
    },
    bar: {
      "driver-name": "Bar",
      source: { type: "official", contact: null },
      "superseded-by": "baz",
      "extra-info": null,
    },
    baz: {
      "driver-name": "Baz",
      source: { type: "official", contact: null },
      "superseded-by": null,
      "extra-info": null,
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
