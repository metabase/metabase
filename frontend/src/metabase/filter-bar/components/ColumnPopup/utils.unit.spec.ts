import type { IconName } from "metabase-types/api";

import type { ColumnGroup, ColumnItem } from "../../types";

import {
  type ListRow,
  buildList,
  findExactItem,
  getItemDisplay,
  getNextIndex,
} from "./utils";

const ICON: IconName = "string";

const item = (label: string): ColumnItem<string> => ({
  type: "column",
  column: { key: label, label, icon: ICON },
});

const ORDERS: ColumnGroup<string> = {
  label: "Orders",
  icon: "table",
  sections: [
    { items: [item("ID"), item("Total")] },
    { label: "Dates", items: [item("Created At"), item("Created")] },
  ],
};

const PEOPLE: ColumnGroup<string> = {
  label: "People",
  icon: "table",
  sections: [{ items: [item("Name"), item("Email")] }],
};

const describeRows = (rows: ListRow<string>[]) =>
  rows.map((row) => {
    if (row.type === "group") {
      return `group ${row.group.label}${row.isCollapsed ? " (collapsed)" : ""}`;
    }
    if (row.type === "section") {
      return `section ${row.label}`;
    }
    return getItemDisplay(row.item).label;
  });

describe("buildList", () => {
  it("lists groups, sections and items", () => {
    expect(
      describeRows(buildList<string>([ORDERS, PEOPLE], "", new Set())),
    ).toEqual([
      "group Orders",
      "ID",
      "Total",
      "section Dates",
      "Created At",
      "Created",
      "group People",
      "Name",
      "Email",
    ]);
  });

  it("shows only the header of a collapsed group", () => {
    const rows = buildList<string>([ORDERS, PEOPLE], "", new Set(["Orders"]));
    expect(describeRows(rows)).toEqual([
      "group Orders (collapsed)",
      "group People",
      "Name",
      "Email",
    ]);
  });

  it("keeps only the matches in their order and opens collapsed groups", () => {
    const rows = buildList<string>(
      [ORDERS, PEOPLE],
      "created",
      new Set(["Orders"]),
    );
    expect(describeRows(rows)).toEqual([
      "group Orders",
      "section Dates",
      "Created At",
      "Created",
    ]);
  });

  it("drops groups and sections without matches", () => {
    expect(
      describeRows(buildList<string>([ORDERS, PEOPLE], "mail", new Set())),
    ).toEqual(["group People", "Email"]);
  });
});

describe("getNextIndex", () => {
  const rows = buildList<string>([ORDERS], "", new Set());

  it("skips section headers", () => {
    expect(getNextIndex(rows, 2, 1)).toBe(4);
  });

  it("stops on group headers", () => {
    expect(getNextIndex(rows, 1, -1)).toBe(0);
  });

  it("wraps around", () => {
    expect(getNextIndex(rows, 0, -1)).toBe(5);
  });
});

describe("findExactItem", () => {
  const rows = buildList<string>([ORDERS, PEOPLE], "", new Set());

  it("finds the item whose label is the query", () => {
    const found = findExactItem(rows, "total");
    expect(found && getItemDisplay(found).label).toBe("Total");
  });

  it("finds nothing when the query starts another label too", () => {
    expect(findExactItem(rows, "created")).toBeNull();
  });

  it("finds nothing for an empty query", () => {
    expect(findExactItem(rows, " ")).toBeNull();
  });
});
