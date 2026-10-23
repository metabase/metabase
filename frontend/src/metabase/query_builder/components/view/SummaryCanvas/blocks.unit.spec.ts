import * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/query/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

import {
  buildBlockQuery,
  createBlock,
  createBlockFromItem,
  dropOnBlock,
  dropOnWell,
  duplicateBlock,
  getBlockDisplay,
  getBlockFilterEditQuery,
  getBlockQuestion,
  getBlockTitle,
  getTemporalUnitOptions,
  setTemporalUnit,
  toBlockFilter,
  updateValue,
} from "./blocks";
import type { SummaryBase, SummaryBlock } from "./types";
import { getSummaryBase } from "./utils";

function createDataQuestion(query: Record<string, unknown> = {}) {
  return new Question(
    createMockCard({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PRODUCTS_ID, ...query },
      },
    }),
    SAMPLE_METADATA,
  );
}

function setup(query: Record<string, unknown> = {}) {
  const dataQuestion = createDataQuestion(query);
  const base = getSummaryBase(dataQuestion.query());
  return { dataQuestion, base };
}

function findColumn(base: SummaryBase, name: string) {
  const column = Lib.breakoutableColumns(base.query, -1).find(
    (column) => Lib.displayInfo(base.query, -1, column).name === name,
  );
  if (column == null) {
    throw new Error(`No column named ${name}`);
  }
  return column;
}

function getLegacyQuery(base: SummaryBase, block: SummaryBlock) {
  const { query, error } = buildBlockQuery(base, block);
  expect(error).toBeNull();
  return query && Lib.toLegacyQuery(query);
}

function widgetFilter(base: SummaryBase) {
  return Lib.stringFilterClause({
    operator: "=",
    column: findColumn(base, "CATEGORY"),
    values: ["Widget"],
    options: {},
  });
}

function groupBy(base: SummaryBase, block: SummaryBlock, name: string) {
  return dropOnWell(
    base,
    block,
    { kind: "column", column: findColumn(base, name), label: name },
    "rows",
  );
}

describe("summary blocks", () => {
  it("starts with a sum of the first number, shown as a number", () => {
    const { base } = setup();
    const block = createBlock(base, []);

    expect(getLegacyQuery(base, block)).toMatchObject({
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["sum", ["field", PRODUCTS.PRICE, expect.anything()]]],
      },
    });
    expect(getBlockDisplay(block)).toBe("scalar");
    expect(getBlockTitle(base, block, buildBlockQuery(base, block).query)).toBe(
      "Sum of Price",
    );
  });

  it("rebuilds on the latest data tab query, so its filters apply to every block", () => {
    const { base } = setup();
    const block = createBlock(base, []);
    const { base: filteredBase } = setup({
      filter: ["=", ["field", PRODUCTS.CATEGORY, null], "Widget"],
    });

    expect(getLegacyQuery(filteredBase, block)).toMatchObject({
      query: {
        filter: ["=", ["field", PRODUCTS.CATEGORY, null], "Widget"],
        aggregation: [["sum", expect.anything()]],
      },
    });
  });

  it("drops sorting and limits from the data tab, which only make sense for rows", () => {
    const { base } = setup({
      "order-by": [["asc", ["field", PRODUCTS.PRICE, null]]],
      limit: 10,
    });
    const legacyQuery = getLegacyQuery(base, createBlock(base, []));

    expect(legacyQuery).not.toHaveProperty("query.order-by");
    expect(legacyQuery).not.toHaveProperty("query.limit");
  });

  it("groups rows and splits columns, and becomes a pivot table with columns", () => {
    const { base } = setup();
    const grouped = groupBy(base, createBlock(base, []), "CATEGORY");
    const split = dropOnWell(
      base,
      grouped,
      {
        kind: "column",
        column: findColumn(base, "VENDOR"),
        label: "Vendor",
      },
      "columns",
    );

    expect(getBlockDisplay(grouped)).toBe("table");
    expect(getBlockDisplay(split)).toBe("pivot");
    expect(getLegacyQuery(base, split)).toMatchObject({
      query: {
        breakout: [
          ["field", PRODUCTS.CATEGORY, expect.anything()],
          ["field", PRODUCTS.VENDOR, expect.anything()],
        ],
      },
    });
  });

  it("writes the pivot split into the block question's settings", () => {
    const { dataQuestion, base } = setup();
    const block = dropOnWell(
      base,
      groupBy(base, createBlock(base, []), "CATEGORY"),
      { kind: "column", column: findColumn(base, "VENDOR"), label: "Vendor" },
      "columns",
    );
    const { query } = buildBlockQuery(base, block);
    const question =
      query && getBlockQuestion(dataQuestion, base, block, query);

    expect(question?.display()).toBe("pivot");
    expect(question?.settings()["pivot_table.column_split"]).toEqual({
      rows: ["CATEGORY"],
      columns: ["VENDOR"],
      values: ["sum"],
    });
  });

  it("moves a column instead of grouping by it twice", () => {
    const { base } = setup();
    const grouped = groupBy(base, createBlock(base, []), "CATEGORY");
    const regrouped = groupBy(base, grouped, "CATEGORY");

    expect(regrouped.rows).toHaveLength(1);
  });

  it("adds a sum for a number dropped on Values", () => {
    const { base } = setup();
    const block = dropOnWell(
      base,
      createBlock(base, []),
      { kind: "column", column: findColumn(base, "RATING"), label: "Rating" },
      "values",
    );

    expect(block.values.map((value) => value.source)).toEqual([
      "Sum([Price])",
      "Sum([Rating])",
    ]);
  });

  it("groups a block by a column dropped onto it", () => {
    const { base } = setup();
    const block = dropOnBlock(base, createBlock(base, []), {
      kind: "column",
      column: findColumn(base, "CATEGORY"),
      label: "Category",
    });

    expect(block.rows).toHaveLength(1);
    expect(getBlockTitle(base, block, buildBlockQuery(base, block).query)).toBe(
      "Sum of Price by Category",
    );
  });

  it("starts a new block counting rows by a column dropped on the canvas", () => {
    const { base } = setup();
    const block = createBlockFromItem(base, [], {
      kind: "column",
      column: findColumn(base, "CATEGORY"),
      label: "Category",
    });

    expect(block && getLegacyQuery(base, block)).toMatchObject({
      query: {
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, expect.anything()]],
      },
    });
  });

  it("reports a value whose formula no longer compiles", () => {
    const { base } = setup();
    const block = createBlock(base, []);
    const brokenBlock = updateValue(block, block.values[0].id, "Sum([Nope])");

    expect(buildBlockQuery(base, brokenBlock)).toEqual({
      query: null,
      error: expect.stringContaining("Sum([Nope])"),
    });
  });

  it("reports a grouping column the data tab no longer has", () => {
    const { base } = setup();
    const block = groupBy(base, createBlock(base, []), "CATEGORY");
    const { base: aggregatedBase } = setup({
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.VENDOR, null]],
    });

    expect(buildBlockQuery(aggregatedBase, block)).toEqual({
      query: null,
      error: expect.stringContaining("no longer available"),
    });
  });

  it("keeps a block's own filters separate from the data tab's", () => {
    const { base } = setup({
      filter: [">", ["field", PRODUCTS.PRICE, null], 10],
    });
    const filter = toBlockFilter(base, widgetFilter(base));
    const block = {
      ...createBlock(base, []),
      filters: filter ? [filter] : [],
    };

    expect(block.filters).toHaveLength(1);
    expect(getLegacyQuery(base, block)).toMatchObject({
      query: {
        filter: [
          "and",
          [">", ["field", PRODUCTS.PRICE, null], 10],
          ["=", ["field", PRODUCTS.CATEGORY, expect.anything()], "Widget"],
        ],
      },
    });
    expect(Lib.filters(getBlockFilterEditQuery(base, block), -1)).toHaveLength(
      1,
    );
  });

  it("keeps a block's filter when the data tab adds the same one", () => {
    const { base } = setup();
    const filter = toBlockFilter(base, widgetFilter(base));
    const block = { ...createBlock(base, []), filters: filter ? [filter] : [] };
    const { base: widgetBase } = setup({
      filter: ["=", ["field", PRODUCTS.CATEGORY, null], "Widget"],
    });

    expect(
      Lib.filters(getBlockFilterEditQuery(widgetBase, block), -1),
    ).toHaveLength(1);
    expect(buildBlockQuery(widgetBase, block).error).toBeNull();
  });

  it("groups dates by a chosen unit", () => {
    const { base } = setup();
    const block = groupBy(base, createBlock(base, []), "CREATED_AT");
    const units = getTemporalUnitOptions(base, block.rows[0].column);
    const byYear = setTemporalUnit(block, block.rows[0].id, "year");

    expect(units.map((unit) => unit.shortName)).toContain("year");
    expect(getLegacyQuery(base, byYear)).toMatchObject({
      query: {
        breakout: [
          [
            "field",
            PRODUCTS.CREATED_AT,
            expect.objectContaining({ "temporal-unit": "year" }),
          ],
        ],
      },
    });
  });

  it("duplicates a block so changing the copy leaves the original alone", () => {
    const { base } = setup();
    const original = { ...createBlock(base, []), cardId: 1 };
    const copy = groupBy(
      base,
      duplicateBlock(original, [original]),
      "CATEGORY",
    );

    expect(copy.id).not.toBe(original.id);
    expect(copy.cardId).toBeNull();
    expect(original.rows).toHaveLength(0);
    expect(copy.rows).toHaveLength(1);
    expect(copy.layout).not.toEqual(original.layout);
  });
});
