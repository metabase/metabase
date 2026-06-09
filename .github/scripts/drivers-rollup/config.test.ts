import { describe, expect, test } from "bun:test";

import {
  type ConfigEntry,
  checkLeafName,
  configIdForLeaf,
  parseDriversConfig,
  statusForId,
  statusForLeaf,
} from "./config";

describe("parseDriversConfig", () => {
  test("extracts valid {id,status} entries from the drivers key", () => {
    const payload = {
      ignored: { drivers: ["whatever"] },
      drivers: [
        { id: "drivers-tests-databricks-ee", status: "skip" },
        { id: "drivers-tests-snowflake-ee", status: "info" },
        { id: "drivers-tests-bigquery-ee", status: "info" },
      ],
    };
    expect(parseDriversConfig(payload)).toEqual([
      { id: "drivers-tests-databricks-ee", status: "skip" },
      { id: "drivers-tests-snowflake-ee", status: "info" },
      { id: "drivers-tests-bigquery-ee", status: "info" },
    ]);
  });

  test("drops malformed entries and unknown statuses", () => {
    const payload = {
      drivers: [
        { id: "ok", status: "required" },
        { id: "no-status" },
        { status: "info" },
        { id: "bad", status: "nope" },
        null,
        "string",
      ],
    };
    expect(parseDriversConfig(payload)).toEqual([{ id: "ok", status: "required" }]);
  });

  test("returns [] when drivers key is missing or not an array", () => {
    expect(parseDriversConfig({})).toEqual([]);
    expect(parseDriversConfig({ drivers: "x" })).toEqual([]);
    expect(parseDriversConfig(null)).toEqual([]);
    expect(parseDriversConfig(undefined)).toEqual([]);
  });
});

describe("checkLeafName", () => {
  test("strips the reusable-workflow caller prefix", () => {
    expect(checkLeafName("driver-tests / drivers-tests-postgres (Postgres 14.x Driver Tests)")).toBe(
      "drivers-tests-postgres (Postgres 14.x Driver Tests)",
    );
  });

  test("leaves un-prefixed names alone", () => {
    expect(checkLeafName("drivers-tests-h2")).toBe("drivers-tests-h2");
  });
});

const CONFIG: ConfigEntry[] = [
  { id: "drivers-tests-databricks-ee", status: "skip" },
  { id: "drivers-tests-snowflake-ee", status: "info" },
  { id: "drivers-tests-mongo", status: "info" },
  { id: "drivers-tests-mongo-ssl", status: "required" },
];

describe("configIdForLeaf", () => {
  test("matches an exact id", () => {
    expect(configIdForLeaf("drivers-tests-snowflake-ee", CONFIG)).toBe("drivers-tests-snowflake-ee");
  });

  test("matches a matrix leg via the ' (' boundary", () => {
    expect(configIdForLeaf("drivers-tests-mongo (MongoDB 6.0 Driver Tests)", CONFIG)).toBe(
      "drivers-tests-mongo",
    );
  });

  test("does NOT let a shorter id swallow a longer sibling", () => {
    // mongo-ssl must resolve to mongo-ssl, never to mongo.
    expect(configIdForLeaf("drivers-tests-mongo-ssl (MongoDB 6.0)", CONFIG)).toBe(
      "drivers-tests-mongo-ssl",
    );
    expect(configIdForLeaf("drivers-tests-mongo-ssl", CONFIG)).toBe("drivers-tests-mongo-ssl");
  });

  test("returns undefined when nothing matches", () => {
    expect(configIdForLeaf("drivers-tests-postgres (x)", CONFIG)).toBeUndefined();
  });
});

describe("statusForLeaf / statusForId", () => {
  test("missing leaf defaults to required", () => {
    expect(statusForLeaf("drivers-tests-postgres (Postgres 14.x)", CONFIG)).toBe("required");
  });

  test("listed leaf uses its configured status", () => {
    expect(statusForLeaf("drivers-tests-databricks-ee", CONFIG)).toBe("skip");
    expect(statusForLeaf("drivers-tests-mongo (MongoDB Latest)", CONFIG)).toBe("info");
  });

  test("statusForId is exact-match only, missing → required", () => {
    expect(statusForId("drivers-tests-snowflake-ee", CONFIG)).toBe("info");
    expect(statusForId("drivers-tests-h2", CONFIG)).toBe("required");
    // exact-match: a matrix-suffixed string is NOT an id
    expect(statusForId("drivers-tests-mongo (x)", CONFIG)).toBe("required");
  });
});
