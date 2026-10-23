import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { type CutTab, addSplit, applyCut, getCutTabs } from "./cuts";
import { getExploreSuggestions } from "./suggestions";
import { STAGE_INDEX } from "./utils";

function createQuery() {
  return Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
}

function applyText(query: Lib.Query, text: string) {
  const [suggestion] = getExploreSuggestions(
    { query, stageIndex: STAGE_INDEX },
    text,
  );
  if (suggestion?.apply == null) {
    throw new Error(`Nothing to apply for "${text}"`);
  }
  return suggestion.apply(query);
}

function findTab(query: Lib.Query, label: string): CutTab {
  const tab = getCutTabs(query).find((tab) =>
    tab.kind === "dimension" ? tab.longLabel === label : tab.kind === label,
  );
  if (tab == null) {
    throw new Error(`No ${label} tab`);
  }
  return tab;
}

function describeQuery(query: Lib.Query) {
  const names = (
    clauses: (Lib.FilterClause | Lib.AggregationClause | Lib.BreakoutClause)[],
  ) =>
    clauses.map(
      (clause) => Lib.displayInfo(query, STAGE_INDEX, clause).displayName,
    );
  return {
    filters: names(Lib.filters(query, STAGE_INDEX)),
    aggregations: names(Lib.aggregations(query, STAGE_INDEX)),
    breakouts: names(Lib.breakouts(query, STAGE_INDEX)),
  };
}

describe("cut tabs", () => {
  it("offers rows, a total, the main date, then categories", () => {
    const tabs = getCutTabs(createQuery());
    expect(tabs.slice(0, 3).map((tab) => tab.key)).toEqual([
      "rows",
      "total",
      "Created At",
    ]);
    expect(tabs.find((tab) => tab.isActive)?.kind).toBe("rows");
  });

  it("keeps tabs in place when one is picked, without adding a second date", () => {
    const query = createQuery();
    const keys = (query: Lib.Query) => getCutTabs(query).map((tab) => tab.key);
    const byCategory = applyCut(
      query,
      findTab(query, "Product → Category"),
      [],
    );
    const byMonth = applyCut(query, findTab(query, "Created At"), []);
    expect(keys(byCategory)).toEqual(keys(query));
    expect(keys(byMonth)).toEqual(keys(query));
  });

  it("re-cuts the slice without touching its filters, keeping the calculation", () => {
    const slice = applyText(
      applyText(createQuery(), "total over 50"),
      "sum of total by month",
    );
    const byCategory = applyCut(
      slice,
      findTab(slice, "Product → Category"),
      [],
    );
    expect(describeQuery(byCategory)).toEqual({
      filters: ["Total is greater than 50"],
      aggregations: ["Sum of Total"],
      breakouts: ["Category"],
    });
  });

  it("brings the calculation back after showing rows, and counts when there was none", () => {
    const summarized = applyText(createQuery(), "sum of total by month");
    const rows = applyCut(summarized, findTab(summarized, "rows"), []);
    expect(describeQuery(rows).aggregations).toEqual([]);

    const previous = Lib.aggregations(summarized, STAGE_INDEX);
    const byState = applyCut(rows, findTab(rows, "User → State"), previous);
    expect(describeQuery(byState).aggregations).toEqual(["Sum of Total"]);

    const counted = applyCut(rows, findTab(rows, "total"), []);
    expect(describeQuery(counted)).toMatchObject({
      aggregations: ["Count"],
      breakouts: [],
    });
  });

  it("splits a cut by another grouping", () => {
    const byMonth = applyText(createQuery(), "count by month");
    const tab = findTab(byMonth, "Product → Category");
    if (tab.kind !== "dimension") {
      throw new Error("Expected a dimension tab");
    }
    const split = addSplit(byMonth, tab.column, []);
    expect(describeQuery(split).breakouts).toEqual([
      "Created At: Month",
      "Category",
    ]);
    expect(
      getCutTabs(split)
        .filter((tab) => tab.isActive)
        .map((tab) => tab.key),
    ).toEqual(["Created At", "Product → Category"]);
  });
});
