import { checkNotNull } from "metabase/utils/types";
import type { IndexField } from "metabase-types/api";
import { createMockRequestableIndexes } from "metabase-types/api/mocks";

import { buildInitialValues, toStructured } from "./utils";

const { btree, gin } = createMockRequestableIndexes();
const BTREE_FIELDS = checkNotNull(btree).fields;
const GIN_FIELDS = checkNotNull(gin).fields;

const STYLE_FIELD: IndexField = {
  name: "style",
  "display-name": "Distribution style",
  type: "select",
  options: [
    { name: "Key", value: "key" },
    { name: "All", value: "all" },
    { name: "Even", value: "even" },
  ],
};

const DISTKEY_COLUMNS_FIELD: IndexField = {
  name: "columns",
  "display-name": "Columns",
  type: "columns",
};

const SKIP_INDEX_FIELDS: IndexField[] = [
  { name: "name", "display-name": "Name", type: "string", required: true },
  {
    name: "type",
    "display-name": "Skip index type",
    type: "select",
    options: [
      { name: "minmax", value: "minmax" },
      { name: "set", value: "set" },
    ],
  },
  {
    name: "columns",
    "display-name": "Columns",
    type: "columns",
    required: true,
  },
  { name: "granularity", "display-name": "Granularity", type: "integer" },
];

describe("toStructured", () => {
  it("omits an empty columns field (e.g. an ALL distkey selects no columns)", () => {
    const fields = [STYLE_FIELD, DISTKEY_COLUMNS_FIELD];
    const values = { ...buildInitialValues(fields), style: "all" };

    const result = toStructured("distkey", fields, values);

    expect(result).toEqual({ kind: "distkey", style: "all" });
    expect(result).not.toHaveProperty("columns");
  });

  it("emits selected columns as name-only when the field has no directions", () => {
    // The input column carries a direction, but gin's columns field has none,
    // so the serialized shape must drop it.
    const result = toStructured("gin", GIN_FIELDS, {
      name: "idx_search",
      columns: [{ name: "city", direction: "asc" }],
    });

    expect(result).toEqual({
      kind: "gin",
      name: "idx_search",
      columns: [{ name: "city" }],
    });
  });

  it("emits directions on columns when the field supports them, defaulting to asc", () => {
    const result = toStructured("btree", BTREE_FIELDS, {
      name: "idx",
      unique: true,
      columns: [{ name: "city", direction: "desc" }, { name: "country" }],
    });

    expect(result).toHaveProperty("columns", [
      { name: "city", direction: "desc" },
      { name: "country", direction: "asc" },
    ]);
  });

  it("omits a blank optional integer field (skip-index without granularity)", () => {
    const values = {
      ...buildInitialValues(SKIP_INDEX_FIELDS),
      name: "idx_skip",
      columns: [{ name: "city" }],
    };

    const result = toStructured("skip-index", SKIP_INDEX_FIELDS, values);

    expect(result).toEqual({
      kind: "skip-index",
      name: "idx_skip",
      type: "minmax",
      columns: [{ name: "city" }],
    });
    expect(result).not.toHaveProperty("granularity");
  });

  it("preserves an explicit 0 for an integer field", () => {
    const result = toStructured("skip-index", SKIP_INDEX_FIELDS, {
      name: "idx_skip",
      type: "minmax",
      columns: [{ name: "city" }],
      granularity: 0,
    });

    expect(result).toHaveProperty("granularity", 0);
  });

  it("preserves a false boolean field", () => {
    const result = toStructured("btree", BTREE_FIELDS, {
      name: "idx",
      unique: false,
      columns: [{ name: "city", direction: "asc" }],
    });

    expect(result).toHaveProperty("unique", false);
  });

  it("leaves a normal btree payload unchanged", () => {
    const result = toStructured("btree", BTREE_FIELDS, {
      name: "idx_orders",
      unique: true,
      columns: [
        { name: "city", direction: "asc" },
        { name: "country", direction: "asc" },
      ],
    });

    expect(result).toEqual({
      kind: "btree",
      name: "idx_orders",
      unique: true,
      columns: [
        { name: "city", direction: "asc" },
        { name: "country", direction: "asc" },
      ],
    });
  });
});
