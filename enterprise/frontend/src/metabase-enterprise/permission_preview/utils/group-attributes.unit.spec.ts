import type { ParameterTarget } from "metabase-types/api";
import { createMockDatabase, createMockTable } from "metabase-types/api/mocks";

import { formatList } from "./format-list";
import { getGroupAttributes, getUseDescription } from "./group-attributes";

const SALES = 9;
const TARGET: ParameterTarget = ["dimension", ["field", 1, null]];

const databases = [
  createMockDatabase({
    id: 1,
    name: "Sample",
    router_user_attribute: "region",
    tables: [
      createMockTable({ id: 10, display_name: "Orders" }),
      createMockTable({ id: 11, display_name: "Products" }),
    ],
  }),
  createMockDatabase({ id: 2, name: "Warehouse", tables: [] }),
];

function policy(table_id: number, attributes: string[]) {
  return {
    id: table_id,
    group_id: SALES,
    table_id,
    card_id: null,
    permission_id: null,
    attribute_remappings: Object.fromEntries(
      attributes.map((attribute) => [attribute, TARGET]),
    ),
  };
}

describe("getGroupAttributes", () => {
  it("reads attributes in the order the rules read them: security, impersonation, routing", () => {
    const attributes = getGroupAttributes({
      groupId: SALES,
      policies: [policy(10, ["category"]), policy(11, ["category", "state"])],
      impersonations: [{ db_id: 2, group_id: SALES, attribute: "role" }],
      databases,
    });

    expect(attributes.map(({ name }) => name)).toEqual([
      "category",
      "state",
      "role",
      "region",
    ]);
  });

  it("joins the tables and databases an attribute is used on", () => {
    const [category] = getGroupAttributes({
      groupId: SALES,
      policies: [policy(10, ["category"]), policy(11, ["category"])],
      impersonations: [],
      databases,
    });

    expect(category.uses.map(getUseDescription)).toEqual([
      "Used by row and column security on Orders and Products",
    ]);
  });

  it("describes impersonation and routing with their databases", () => {
    const attributes = getGroupAttributes({
      groupId: SALES,
      policies: [],
      impersonations: [{ db_id: 2, group_id: SALES, attribute: "role" }],
      databases,
    });

    expect(
      attributes.flatMap(({ uses }) => uses.map(getUseDescription)),
    ).toEqual([
      "Used by connection impersonation on Warehouse",
      "Used by database routing on Sample",
    ]);
  });

  it("leaves out Metabase's own attributes and other groups' impersonation", () => {
    const attributes = getGroupAttributes({
      groupId: SALES,
      policies: [policy(10, ["@tenant.slug"])],
      impersonations: [{ db_id: 2, group_id: 99, attribute: "role" }],
      databases: [databases[1]],
    });

    expect(attributes).toEqual([]);
  });
});

describe("formatList", () => {
  it.each([
    [["A"], "A"],
    [["A", "B"], "A and B"],
    [["A", "B", "C"], "A, B and C"],
  ])("writes %p as %p", (names, text) => {
    expect(formatList(names)).toBe(text);
  });
});
