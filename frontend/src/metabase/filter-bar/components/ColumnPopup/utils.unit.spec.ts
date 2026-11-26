import type { IconName } from "metabase-types/api";

import type { ColumnGroup, ColumnItem } from "../../types";

import {
  type ListRow,
  buildList,
  findExactItem,
  getFirstItemIndex,
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
    const rows = buildList<string>([ORDERS, PEOPLE], "a", new Set(["Orders"]));
    expect(describeRows(rows)).toEqual([
      "group Orders",
      "Total",
      "section Dates",
      "Created At",
      "Created",
      "group People",
      "Name",
      "Email",
    ]);
  });

  it("does not open collapsed groups for a whitespace-only query", () => {
    const rows = buildList<string>([ORDERS, PEOPLE], "  ", new Set(["Orders"]));
    expect(describeRows(rows)).toEqual([
      "group Orders (collapsed)",
      "group People",
      "Name",
      "Email",
    ]);
  });

  it.each<[string, string[]]>([
    ["mail", ["group People", "Email"]],
    ["total", ["group Orders", "Total"]],
  ])("drops groups and sections without matches for %j", (query, rows) => {
    expect(
      describeRows(buildList<string>([ORDERS, PEOPLE], query, new Set())),
    ).toEqual(rows);
  });
});

describe("getFirstItemIndex", () => {
  it.each<[string, string, number]>([
    ["the group header", "", 1],
    ["the group and section headers", "created", 2],
  ])("skips %s", (_, query, index) => {
    const rows = buildList<string>([ORDERS], query, new Set());
    expect(getFirstItemIndex(rows)).toBe(index);
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

  it.each<1 | -1>([1, -1])(
    "stays put when nothing else is navigable (step %d)",
    (step) => {
      const collapsed = buildList<string>([ORDERS], "", new Set(["Orders"]));
      expect(getNextIndex(collapsed, 0, step)).toBe(0);
    },
  );
});

describe("findExactItem", () => {
  const rows = buildList<string>([ORDERS, PEOPLE], "", new Set());

  it("finds an item in a later group", () => {
    const found = findExactItem(rows, "email");
    expect(found && getItemDisplay(found).label).toBe("Email");
  });
});
