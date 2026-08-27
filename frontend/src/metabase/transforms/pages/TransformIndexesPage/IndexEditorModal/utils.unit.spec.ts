import type { IndexField } from "metabase-types/api";

import { toStructured } from "./utils";

function field(overrides: Partial<IndexField> & { name: string }): IndexField {
  return {
    "display-name": overrides.name,
    type: "string",
    ...overrides,
  };
}

describe("toStructured", () => {
  it("omits an optional scalar left blank instead of sending null", () => {
    const fields = [
      field({ name: "type", type: "select" }),
      field({ name: "granularity", type: "integer" }),
    ];

    const structured = toStructured("skip-index", fields, {
      type: "minmax",
      granularity: null,
    });

    expect(structured).toEqual({ kind: "skip-index", type: "minmax" });
    expect("granularity" in structured).toBe(false);
  });

  it("omits an optional string/select left blank instead of sending an empty string", () => {
    const fields = [
      field({ name: "name", type: "string" }),
      field({ name: "collation", type: "select" }),
    ];

    const structured = toStructured("btree", fields, {
      name: "idx",
      collation: "",
    });

    expect(structured).toEqual({ kind: "btree", name: "idx" });
    expect("collation" in structured).toBe(false);
  });

  it("omits an optional column list left empty instead of sending []", () => {
    const fields = [
      field({ name: "style", type: "select" }),
      field({ name: "columns", type: "columns" }),
    ];

    const structured = toStructured("distkey", fields, {
      style: "all",
      columns: [],
    });

    expect(structured).toEqual({ kind: "distkey", style: "all" });
    expect("columns" in structured).toBe(false);
  });

  it("keeps a required field even when empty so validation can flag it", () => {
    const fields = [
      field({ name: "granularity", type: "integer", required: true }),
    ];

    const structured = toStructured("skip-index", fields, {
      granularity: null,
    });

    expect(structured).toEqual({ kind: "skip-index", granularity: null });
  });

  it("keeps falsy-but-present values like a boolean false", () => {
    const fields = [field({ name: "unique", type: "boolean" })];

    const structured = toStructured("btree", fields, { unique: false });

    expect(structured).toEqual({ kind: "btree", unique: false });
  });

  it("maps a populated column list, defaulting direction when the kind supports it", () => {
    const fields = [
      field({ name: "columns", type: "columns", directions: true }),
    ];

    const structured = toStructured("btree", fields, {
      columns: [{ name: "city" }, { name: "country", direction: "desc" }],
    });

    expect(structured).toEqual({
      kind: "btree",
      columns: [
        { name: "city", direction: "asc" },
        { name: "country", direction: "desc" },
      ],
    });
  });
});
