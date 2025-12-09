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

  it("should not format SQL keywords inside comment lines", () => {
    expect(
      formatNativeQuery(
        "-- SELECT * FROM products WHERE category = 'Widget'\nSELECT * FROM products WHERE category = 'Widget'",
        "postgres",
      ),
    ).toEqual(
      "-- SELECT * FROM products WHERE category = 'Widget'\nSELECT *\nFROM products\nWHERE category = 'Widget'",
    );

    expect(
      formatNativeQuery(
        "-- SELECT * FROM products LEFT JOIN orders ON products.id = orders.product_id\nSELECT * FROM products LEFT JOIN orders ON products.id = orders.product_id",
        "postgres",
      ),
    ).toEqual(
      "-- SELECT * FROM products LEFT JOIN orders ON products.id = orders.product_id\nSELECT *\nFROM products\nLEFT JOIN orders ON products.id = orders.product_id",
    );

    expect(
      formatNativeQuery(
        "-- SELECT * FROM products GROUP BY category\nSELECT * FROM products GROUP BY category",
        "postgres",
      ),
    ).toEqual(
      "-- SELECT * FROM products GROUP BY category\nSELECT *\nFROM products\nGROUP BY category",
    );

    expect(
      formatNativeQuery(
        "-- SELECT * FROM products ORDER BY category\nSELECT * FROM products ORDER BY category",
        "postgres",
      ),
    ).toEqual(
      "-- SELECT * FROM products ORDER BY category\nSELECT *\nFROM products\nORDER BY category",
    );

    expect(
      formatNativeQuery(
        "-- SELECT * FROM products LIMIT 3\nSELECT * FROM products LIMIT 3",
        "postgres",
      ),
    ).toEqual(
      "-- SELECT * FROM products LIMIT 3\nSELECT *\nFROM products\nLIMIT 3",
    );

    expect(
      formatNativeQuery(
        "-- SELECT * FROM products WHERE category = 'Widget' AND (rating > 4 OR rating < 2)\nSELECT * FROM products WHERE category = 'Widget' AND (rating > 4 OR rating < 2)",
        "postgres",
      ),
    ).toEqual(
      "-- SELECT * FROM products WHERE category = 'Widget' AND (rating > 4 OR rating < 2)\nSELECT *\nFROM products\nWHERE category = 'Widget'\n   AND (rating > 4\n    OR rating < 2)",
    );
  });

  it("should return formatted JSON", () => {
    expect(formatNativeQuery({}, "mongo")).toEqual("{}");
    expect(formatNativeQuery([], "mongo")).toEqual("[]");
    expect(formatNativeQuery(["foo"], "mongo")).toEqual('[\n  "foo"\n]');
    expect(formatNativeQuery({ a: 1 }, "mongo")).toEqual('{\n  "a": 1\n}');
    expect(formatNativeQuery('["foo"]', "mongo")).toEqual('["foo"]');
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
