import * as Lib from "metabase-lib";
import { SAMPLE_METADATA } from "metabase-lib/query/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import { PRODUCTS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import {
  applyFormulaEdit,
  getBlockColumns,
  getBlockFunction,
  getCallSource,
  getColumnEdit,
  getFunctionEdit,
} from "./formula-blocks";

function setup() {
  return new Question(
    createMockCard({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PRODUCTS_ID },
      },
    }),
    SAMPLE_METADATA,
  ).query();
}

const columnNames = (query: Lib.Query, columns: Lib.ColumnMetadata[]) =>
  columns.map((column) => Lib.displayInfo(query, -1, column).displayName);

// "Sum([Category])" is not valid for Sum, so switching functions must replace it.
const SOURCE = "Distinct([Category]) + Sum([Price])";
const DISTINCT_CALL = {
  from: 0,
  to: 20,
  columns: [{ from: 9, to: 19, label: "Category" }],
};
const SUM_CALL = {
  from: 23,
  to: 35,
  columns: [{ from: 27, to: 34, label: "Price" }],
};

describe("formula blocks", () => {
  it("resolves typed function names and aliases", () => {
    expect(getBlockFunction("AVG")).toBe("avg");
    expect(getBlockFunction("average")).toBe("avg");
    expect(getBlockFunction("Median")).toBeUndefined();
  });

  it("offers only columns a function accepts", () => {
    const query = setup();
    expect(columnNames(query, getBlockColumns(query, "sum"))).not.toContain(
      "Category",
    );
    expect(columnNames(query, getBlockColumns(query, "max"))).toContain(
      "Created At",
    );
    expect(columnNames(query, getBlockColumns(query, "distinct"))).toContain(
      "Category",
    );
    expect(getBlockColumns(query, "count")).toEqual([]);
  });

  it("starts new calls on the first non-ID number", () => {
    const query = setup();
    expect(getCallSource(query, "sum")).toBe("Sum([Price])");
    expect(getCallSource(query, "count")).toBe("Count()");
  });

  it("keeps a call's column when the new function accepts it", () => {
    const query = setup();
    const edit = getFunctionEdit(query, SUM_CALL, "max");
    expect(applyFormulaEdit(SOURCE, edit)).toBe(
      "Distinct([Category]) + Max([Price])",
    );
  });

  it("replaces a column the new function cannot use", () => {
    const query = setup();
    const edit = getFunctionEdit(query, DISTINCT_CALL, "avg");
    expect(applyFormulaEdit(SOURCE, edit)).toBe(
      "Average([Price]) + Sum([Price])",
    );
  });

  it("drops the column when switching to Count", () => {
    const query = setup();
    const edit = getFunctionEdit(query, SUM_CALL, "count");
    expect(applyFormulaEdit(SOURCE, edit)).toBe(
      "Distinct([Category]) + Count()",
    );
  });

  it("swaps one column reference", () => {
    const query = setup();
    const rating = getBlockColumns(query, "sum").find(
      (column) => Lib.displayInfo(query, -1, column).displayName === "Rating",
    );
    if (!rating) {
      throw new Error("Expected a Rating column");
    }
    const edit = getColumnEdit(query, SUM_CALL, 0, rating);
    expect(edit && applyFormulaEdit(SOURCE, edit)).toBe(
      "Distinct([Category]) + Sum([Rating])",
    );
    expect(getColumnEdit(query, SUM_CALL, 1, rating)).toBeNull();
  });
});
