import {
  getColumnKey,
  getColumnNameFromKey,
  getLegacyColumnKey,
} from "metabase-lib/v1/queries/utils/column-key";
import type { DatasetColumn } from "metabase-types/api";

type TestCase = {
  title: string;
  column: Pick<DatasetColumn, "name" | "field_ref">;
  expectedKey: string;
};

describe("getColumnKey", () => {
  it.each<TestCase>([
    {
      title: "id-based field ref",
      column: { name: "foo", field_ref: ["field", 1, null] },
      expectedKey: JSON.stringify(["name", "foo"]),
    },
    {
      title: "name-based field ref",
      column: {
        name: "foo",
        field_ref: ["field", "foo", { "base-type": "type/Text" }],
      },
      expectedKey: JSON.stringify(["name", "foo"]),
    },
  ])("should create a name-based key: $title", ({ column, expectedKey }) => {
    expect(getColumnKey(column)).toEqual(expectedKey);
  });
});

describe("getLegacyColumnKey", () => {
  it.each<TestCase>([
    {
      title: "id-based field ref",
      column: { name: "foo", field_ref: ["field", 1, null] },
      expectedKey: JSON.stringify(["ref", ["field", 1, null]]),
    },
    {
      title: "explicitly joined column",
      column: {
        name: "foo",
        field_ref: ["field", 1, { "join-alias": "x" }],
      },
      expectedKey: JSON.stringify(["ref", ["field", 1, { "join-alias": "x" }]]),
    },
    {
      title: "implicitly joined column",
      column: {
        name: "foo",
        field_ref: ["field", 1, { "source-field": 2 }],
      },
      expectedKey: JSON.stringify(["ref", ["field", 1, { "source-field": 2 }]]),
    },
    {
      title: "temporal-unit is removed from the key",
      column: {
        name: "foo",
        field_ref: ["field", 1, { "temporal-unit": "minute" }],
      },
      expectedKey: JSON.stringify(["ref", ["field", 1, null]]),
    },
    {
      title: "binning is removed from key",
      column: {
        name: "foo",
        field_ref: [
          "field",
          1,
          {
            "base-type": "type/Integer",
            binning: { strategy: "num-bins", "num-bins": 10 },
          },
        ],
      },
      expectedKey: JSON.stringify([
        "ref",
        ["field", 1, { "base-type": "type/Integer" }],
      ]),
    },
    {
      title: "expression",
      column: {
        name: "foo",
        field_ref: ["expression", "foo"],
      },
      expectedKey: JSON.stringify(["ref", ["expression", "foo"]]),
    },
  ])("should create a ref-based key: $title", ({ column, expectedKey }) => {
    expect(getLegacyColumnKey(column)).toEqual(expectedKey);
  });

  it.each<TestCase>([
    {
      title: "name-based field ref",
      column: {
        name: "foo",
        field_ref: ["field", "foo", { "base-type": "type/Text" }],
      },
      expectedKey: JSON.stringify(["name", "foo"]),
    },
    {
      title: "aggregation",
      column: {
        name: "count",
        field_ref: ["aggregation", 0],
      },
      expectedKey: JSON.stringify(["name", "count"]),
    },
  ])("should create a name-based key: $title", ({ column, expectedKey }) => {
    expect(getLegacyColumnKey(column)).toEqual(expectedKey);
  });
});

describe("getColumnNameFromKey", () => {
  it("should return the name from a name-based key", () => {
    expect(getColumnNameFromKey(JSON.stringify(["name", "foo"]))).toBe("foo");
  });

  it("should ignore a field ref-based key", () => {
    expect(
      getColumnNameFromKey(JSON.stringify(["ref", ["field", 1, null]])),
    ).toBeUndefined();
  });

  it("should ignore invalid json", () => {
    expect(getColumnNameFromKey("not a json string")).toBeUndefined();
  });
});
