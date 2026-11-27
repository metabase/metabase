import {
  type SuggestionGroup,
  type SuggestionItem,
  getOptions,
  getVisibleGroups,
} from "./utils";

const item = (key: string): SuggestionItem<string> => ({
  type: "item",
  key,
  label: key,
  value: key,
});

const ORDERS: SuggestionGroup<string> = {
  key: "orders",
  header: { label: "Orders", icon: "table" },
  rows: [
    item("ID"),
    { type: "label", key: "dates", label: "Dates" },
    item("Created At"),
  ],
};

const BOOL_OP: SuggestionGroup<string> = {
  key: "bool-op",
  rows: [item("OR")],
};

const COLLAPSED = new Set(["orders", "bool-op"]);

const describeOptions = (
  groups: readonly SuggestionGroup<string>[],
  collapsedKeys: ReadonlySet<string>,
  query: string,
) =>
  getOptions(getVisibleGroups(groups, collapsedKeys, query)).map((option) =>
    option.type === "header" ? `header ${option.key}` : option.key,
  );

describe("getVisibleGroups and getOptions", () => {
  it("lists headers and items, but not labels", () => {
    expect(describeOptions([BOOL_OP, ORDERS], new Set(), "")).toEqual([
      "OR",
      "header orders",
      "ID",
      "Created At",
    ]);
  });

  it("shows only the header of a collapsed group", () => {
    expect(describeOptions([ORDERS], COLLAPSED, "")).toEqual(["header orders"]);
  });

  it("opens collapsed groups while searching", () => {
    expect(describeOptions([ORDERS], COLLAPSED, "a")).toEqual([
      "header orders",
      "ID",
      "Created At",
    ]);
  });

  it("keeps collapsed groups closed for a whitespace-only query", () => {
    expect(describeOptions([ORDERS], COLLAPSED, "  ")).toEqual([
      "header orders",
    ]);
  });

  it("never collapses a group without a header", () => {
    expect(describeOptions([BOOL_OP], COLLAPSED, "")).toEqual(["OR"]);
  });
});
