import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import {
  type ColumnValueOptions,
  type ExploreSuggestion,
  getExploreSuggestions,
  parseRelativeDateRange,
} from "./suggestions";

const STAGE_INDEX = -1;

type SetupOpts = {
  text: string;
  columnValues?: ColumnValueOptions[];
};

function setup({ text, columnValues }: SetupOpts) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const suggestions = getExploreSuggestions(
    { query, stageIndex: STAGE_INDEX, columnValues },
    text,
  );
  return { query, suggestions };
}

function applySuggestion(query: Lib.Query, suggestion: ExploreSuggestion) {
  if (suggestion.apply == null) {
    throw new Error(`"${suggestion.label}" can't be applied`);
  }
  return suggestion.apply(query);
}

function getClauseNames(
  query: Lib.Query,
  clauses: (Lib.FilterClause | Lib.AggregationClause | Lib.BreakoutClause)[],
) {
  return clauses.map(
    (clause) => Lib.displayInfo(query, STAGE_INDEX, clause).displayName,
  );
}

function findColumn(query: Lib.Query, displayName: string) {
  const column = Lib.filterableColumns(query, STAGE_INDEX).find(
    (column) =>
      Lib.displayInfo(query, STAGE_INDEX, column).longDisplayName ===
      displayName,
  );
  if (column == null) {
    throw new Error(`No column named ${displayName}`);
  }
  return column;
}

describe("getExploreSuggestions", () => {
  it("offers calculations before anything is typed", () => {
    const { suggestions } = setup({ text: "" });
    expect(suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining([
        "Count of rows",
        "Sum of Total",
        "Group by Created At: Month",
      ]),
    );
  });

  it("turns 'sum of total' into a calculation", () => {
    const { query, suggestions } = setup({ text: "sum of total" });
    const [first] = suggestions;
    expect(first).toMatchObject({ kind: "aggregation", label: "Sum of Total" });

    const nextQuery = applySuggestion(query, first);
    expect(
      getClauseNames(nextQuery, Lib.aggregations(nextQuery, STAGE_INDEX)),
    ).toEqual(["Sum of Total"]);
  });

  it("turns 'count by month' into a whole summary", () => {
    const { query, suggestions } = setup({ text: "count by month" });
    const [first] = suggestions;
    expect(first).toMatchObject({
      kind: "summary",
      label: "Count of rows by Created At: Month",
    });

    const nextQuery = applySuggestion(query, first);
    expect(
      getClauseNames(nextQuery, Lib.aggregations(nextQuery, STAGE_INDEX)),
    ).toEqual(["Count"]);
    expect(
      getClauseNames(nextQuery, Lib.breakouts(nextQuery, STAGE_INDEX)),
    ).toEqual(["Created At: Month"]);
  });

  it("turns 'by state' into a grouping on a linked table's column", () => {
    const { query, suggestions } = setup({ text: "by state" });
    const [first] = suggestions;
    expect(first).toMatchObject({
      kind: "breakout",
      label: "Group by User → State",
    });

    const nextQuery = applySuggestion(query, first);
    expect(
      getClauseNames(nextQuery, Lib.breakouts(nextQuery, STAGE_INDEX)),
    ).toEqual(["State"]);
  });

  it("turns 'last 30 days' into a date filter on the creation date", () => {
    const { query, suggestions } = setup({ text: "last 30 days" });
    const [first] = suggestions;
    expect(first.kind).toBe("filter");

    const nextQuery = applySuggestion(query, first);
    expect(
      getClauseNames(nextQuery, Lib.filters(nextQuery, STAGE_INDEX)),
    ).toEqual(["Created At is in the previous 30 days"]);
  });

  it("turns 'total over 50' into a number filter", () => {
    const { query, suggestions } = setup({ text: "total over 50" });
    const [first] = suggestions;
    expect(first).toMatchObject({
      kind: "filter",
      label: "Total is greater than 50",
    });

    const nextQuery = applySuggestion(query, first);
    expect(
      getClauseNames(nextQuery, Lib.filters(nextQuery, STAGE_INDEX)),
    ).toEqual(["Total is greater than 50"]);
  });

  it("turns a known value into a filter on its column", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const column = findColumn(query, "Product → Category");
    const { suggestions } = setup({
      text: "gadget",
      columnValues: [{ column, values: ["Doohickey", "Gadget", "Widget"] }],
    });
    const [first] = suggestions;
    expect(first).toMatchObject({
      kind: "filter",
      label: "Product → Category is Gadget",
    });

    const nextQuery = applySuggestion(query, first);
    expect(
      getClauseNames(nextQuery, Lib.filters(nextQuery, STAGE_INDEX)),
    ).toEqual(["Category is Gadget"]);
  });

  it("falls back to searching the name column for free text", () => {
    const { query, suggestions } = setup({ text: "acme" });
    const search = suggestions.find(
      (suggestion) => suggestion.kind === "search",
    );
    expect(search?.label).toBe("Search “acme” in Product → Title");

    const nextQuery = applySuggestion(query, search ?? suggestions[0]);
    expect(
      getClauseNames(nextQuery, Lib.filters(nextQuery, STAGE_INDEX)),
    ).toEqual(["Title contains acme"]);
  });

  it("compiles a formula into a calculation, a filter, or a new column", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

    const [aggregation] = setup({ text: "= Sum([Total]) / 2" }).suggestions;
    expect(aggregation.kind).toBe("aggregation");
    expect(
      Lib.aggregations(applySuggestion(query, aggregation), STAGE_INDEX),
    ).toHaveLength(1);

    const [filter] = setup({ text: "= [Total] > 100" }).suggestions;
    expect(filter.kind).toBe("filter");
    expect(
      Lib.filters(applySuggestion(query, filter), STAGE_INDEX),
    ).toHaveLength(1);

    const [column] = setup({ text: "= [Total] * 2" }).suggestions;
    expect(column).toMatchObject({ kind: "column", label: "Total * 2" });
    expect(
      Lib.expressions(applySuggestion(query, column), STAGE_INDEX),
    ).toHaveLength(1);
  });

  it("explains a formula that doesn't compile", () => {
    const { suggestions } = setup({ text: "= [Nope] * 2" });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ kind: "invalid", apply: null });
  });

  it("doesn't suggest grouping by a column already grouped by", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const [byState] = setup({ text: "by state" }).suggestions;
    const groupedQuery = applySuggestion(query, byState);
    const suggestions = getExploreSuggestions(
      { query: groupedQuery, stageIndex: STAGE_INDEX },
      "by state",
    );
    expect(suggestions.map((suggestion) => suggestion.label)).not.toContain(
      "Group by User → State",
    );
  });
});

describe("parseRelativeDateRange", () => {
  it.each([
    ["today", { value: 0, unit: "day" }],
    ["yesterday", { value: -1, unit: "day" }],
    ["this month", { value: 0, unit: "month" }],
    ["last 30 days", { value: -30, unit: "day" }],
    ["past week", { value: -1, unit: "week" }],
    ["next 3 months", { value: 3, unit: "month" }],
  ])("parses %s", (text, range) => {
    expect(parseRelativeDateRange(text)).toEqual(range);
  });

  it("ignores text that isn't a date range", () => {
    expect(parseRelativeDateRange("last of the mohicans")).toBeNull();
  });
});
