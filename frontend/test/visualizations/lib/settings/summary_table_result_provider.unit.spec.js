import { TYPE } from "metabase/lib/types";
import type { DatasetData, Row } from "metabase/meta/types/Dataset";

import { Column } from "metabase/meta/types/Dataset";
import isEqual from "lodash.isequal";
import orderBy from "lodash.orderby";
import invert from "lodash.invert";
import {buildResultProvider, createKey} from "metabase/visualizations/lib/summary_table";

const BREAKOUT = "breakout";
const AGGREGATION = "aggregation";

const columnText1 = {
  name: "C1",
  display_name: "Column 1",
  base_type: TYPE.Text,
};
const columnText2 = {
  name: "C2",
  display_name: "Column 2",
  base_type: TYPE.Text,
};
const columnNumeric = {
  name: "C3",
  display_name: "Column 3",
  base_type: TYPE.Number,
};
const allColumns = [columnText1, columnText2, columnNumeric];

const row1 = ["a", "a", 3];
const row2 = ["a", "b", 4];
const row3 = ["c", "b", 1];
const row4 = ["b", "a", 1];
const row5 = ["c", "b", -1];
const allRows = [row1, row2, row3, row4, row5];

const buildData = (rows: Row[], cols: Column[]): DatasetData => ({
  columns: cols.map(p => p.name),
  rows,
  cols,
});

const addSource = (col: Column, source?: string) => {
  if (!source) source = col.base_type === TYPE.Number ? AGGREGATION : BREAKOUT;

  return { ...col, source };
};

describe("summary table result provider", () => {
  describe("given result provider initialized by main results", () => {
    const rawResults = buildData(allRows, allColumns);
    const mainResults = buildData(allRows, allColumns.map(col => addSource(col)));

    const resultsProvider = buildResultProvider(rawResults, [mainResults]);
    it("results provider should return main results", () =>
    {
      const mainKey = createKey(['C1', 'C2'], ['C3']);
      expect(resultsProvider(mainKey)).toBe(mainResults);
    });
    it("results provider should compute results for grand totals", () => {
      const grandTotalKey = createKey([], ["C3"]);
      const expectedResults = buildData([[8]], [addSource(columnNumeric)]);
      expect(
        datasAreEqual(resultsProvider(grandTotalKey), expectedResults),
      ).toEqual(true);
    });
    it("results provider should compute results for totals on C1", () => {
      const totalsKey = createKey(["C1"], ["C3"]);
      const expectedResults = buildData(
        [["a", 7], ["b", 1], ["c", 0]],
        [columnText1, columnNumeric].map(p => addSource(p)),
      );
      expect(
        datasAreEqual(resultsProvider(totalsKey), expectedResults),
      ).toEqual(true);
    });
  });

  describe("given result provider initialized by main and totals results", () => {
    const rawResults = buildData(allRows, allColumns);
    const mainResults = buildData(allRows, allColumns.map(col => addSource(col)));

    const grandTotalKey = createKey([], ["C3"]);
    const grandTotalResults = buildData([[8]], [addSource(columnNumeric)]);

    const totalsKey = createKey(["C1"], ["C3"]);
    const totalsResults = buildData(
      [["a", 7], ["b", 1], ["c", 0]],
      [columnText1, columnNumeric].map(p => addSource(p)),
    );

    const resultsProvider = buildResultProvider(rawResults, [
      mainResults,
      grandTotalResults,
      totalsResults,
    ]);

    it("results provider should return main results", () =>
    {
      const mainKey = createKey(['C1', 'C2'], ['C3']);
      expect(resultsProvider(mainKey)).toBe(mainResults);
    });
    it("results provider should return results for grand totals", () => {
      expect(resultsProvider(grandTotalKey)).toBe(grandTotalResults);
    });
    it("results provider should return results for totals on C1", () => {
      expect(resultsProvider(totalsKey)).toBe(totalsResults);
    });

    it("results provider should compute results for totals on C2", () => {
      const totalsKey = createKey(["C2"], ["C3"]);
      const resRows = [
        [4, "a"],
        [4, "b"],
      ];
      const expectedResults = buildData(
        resRows,
        [columnNumeric, columnText2].map(p => addSource(p)),
      );
      const data = resultsProvider(totalsKey);
      expect(datasAreEqual(data, expectedResults)).toEqual(true);
    });
  });
});

const rowsCmpFunctions = [row => row[0], row => row[1], row => row[2]];

const datasAreEqual = (
  data: DatasetData,
  expectedData: DatasetData,
): boolean => {

  const columnsAreEqual = isEqual(
    orderBy(data.columns),
    orderBy(expectedData.columns),
  );
  if (!columnsAreEqual) return false;

  const colsAreEqual = isEqual(
    orderBy(data.cols, p => p.name),
    orderBy(expectedData.cols, p => p.name),
  );
  if (!colsAreEqual) return false;

  const expColumnToIndex = invert(expectedData.columns);
  const normalizedRows = expectedData.rows.map(row =>
    data.columns.map(columnName => row[expColumnToIndex[columnName]]),
  );

  return isEqual(
    orderBy(data.rows, rowsCmpFunctions),
    orderBy(normalizedRows, rowsCmpFunctions),
  );
};
