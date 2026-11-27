import type { IconName } from "metabase-types/api";

import type { ColumnGroup, ColumnItem } from "../../types";
import type { DraftPick } from "../FilterBar/draft-suggestion";
import type { SuggestionGroup } from "../SuggestionList/utils";

import {
  findExactColumn,
  getColumnSuggestions,
  getItemDisplay,
} from "./columns";

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

const describeGroups = (groups: SuggestionGroup<DraftPick<string>>[]) =>
  groups.flatMap((group) => [
    ...(group.header ? [`group ${group.header.label}`] : []),
    ...group.rows.map((row) =>
      row.type === "label" ? `label ${row.label}` : row.label,
    ),
  ]);

describe("getColumnSuggestions", () => {
  it("lists groups, section labels and columns", () => {
    expect(
      describeGroups(getColumnSuggestions([ORDERS, PEOPLE], "", null)),
    ).toEqual([
      "group Orders",
      "ID",
      "Total",
      "label Dates",
      "Created At",
      "Created",
      "group People",
      "Name",
      "Email",
    ]);
  });

  it("keeps only the matches in their order", () => {
    expect(
      describeGroups(getColumnSuggestions([ORDERS, PEOPLE], "a", null)),
    ).toEqual([
      "group Orders",
      "Total",
      "label Dates",
      "Created At",
      "Created",
      "group People",
      "Name",
      "Email",
    ]);
  });

  it.each<[string, string[]]>([
    ["mail", ["group People", "Email"]],
    ["total", ["group Orders", "Total"]],
  ])(
    "drops groups and section labels without matches for %j",
    (query, rows) => {
      expect(
        describeGroups(getColumnSuggestions([ORDERS, PEOPLE], query, null)),
      ).toEqual(rows);
    },
  );

  it("puts a typed bool op first, in a group without a header", () => {
    const [boolOp] = getColumnSuggestions([ORDERS], "or", "or");
    expect(boolOp.header).toBeUndefined();
    expect(boolOp.rows).toEqual([
      expect.objectContaining({
        label: "OR",
        value: { type: "boolOp", boolOp: "or" },
      }),
    ]);
  });
});

describe("findExactColumn", () => {
  it("finds a column in a later group", () => {
    const found = findExactColumn([ORDERS, PEOPLE], "email");
    expect(found && getItemDisplay(found).label).toBe("Email");
  });
});
