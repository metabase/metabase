import {GroupingManager} from "metabase/visualizations/lib/GroupingManager";
import {TYPE} from "metabase/lib/types";
import type {Row} from "metabase/meta/types/Dataset";

function makeData(rows) {
  return {
    rows: rows,
    cols: [
      {name: "C1", display_name: "Column 1", base_type: TYPE.Text},
      {name: "C2", display_name: "Column 2", base_type: TYPE.Text},
      {name: "C3", display_name: "Column 3", base_type: TYPE.Numeric},
    ],
  };
}

function newStyleWithTop(top: Number) {
  return {height: 1, top: top};
}

const styleMock = newStyleWithTop(0);
const rowVisibleRangeMock = {start: 0, stop: 100};
const newGroupingManager = (rows: Row[]) => new GroupingManager(1, rows)

describe("GroupingManager", () => {
  describe("given empty GroupingManager", () => {
    const gm = newGroupingManager([]);
    it("should return empty array", () => {
      expect(gm.rowsOrdered).toEqual([]);
    });
  });

  describe("given rows in correct order", () => {
    const data = makeData([
      ["a", "x", 1],
      ["a", "y", 2],
      ["a", "z", 3],
      ["b", "z", 4],
      ["b", "x", 5],
      ["b", "y", 6],
    ]);
    const gm = newGroupingManager(data.rows);
    it("should return rows in the the same order", () => {
      expect(gm.rowsOrdered).toEqual(data.rows);
    });

    const hiddenRows = [1, 2, 4, 5];
    hiddenRows.forEach(rn => it("should hide row: " + rn, () => expect(gm.shouldHide(rn, rowVisibleRangeMock)).toEqual(true)));

    const visibleRows = [0, 3];
    visibleRows.forEach(rn => it("should display row: " + rn, () => expect(gm.shouldHide(rn, rowVisibleRangeMock)).toEqual(false)));
  });

  describe("given rows in incorrect order", () => {
    const data = makeData([
      ["a", "x", 1],
      ["c", "z", 4],
      ["b", "x", 5],
      ["a", "y", 2],
      ["a", "z", 3],
      ["b", "y", 6],
    ]);
    const expectedData = makeData([
      ["a", "x", 1],
      ["a", "y", 2],
      ["a", "z", 3],
      ["c", "z", 4],
      ["b", "x", 5],
      ["b", "y", 6],
    ]);
    const gm = newGroupingManager(data.rows);
    it("should return rows in group order", () => {
      expect(gm.rowsOrdered).toEqual(expectedData.rows);
    });

    const hiddenRows = [1, 2, 5];
    hiddenRows.forEach(rn => it("should hide row: " + rn, () => expect(gm.shouldHide(rn, rowVisibleRangeMock)).toEqual(true)));

    const visibleRows = [0, 3, 4];
    visibleRows.forEach(rn => it("should display row: " + rn, () => expect(gm.shouldHide(rn, rowVisibleRangeMock)).toEqual(false)));

    it("should have correct row height", () => {
      expect(gm.mapStyle(0, rowVisibleRangeMock, styleMock).height).toEqual(3);
      expect(gm.mapStyle(3, rowVisibleRangeMock, styleMock).height).toEqual(1);
      expect(gm.mapStyle(4, rowVisibleRangeMock, styleMock).height).toEqual(2);
    });
  });

  //todo:
  // describe("given range of visible rows with lower boundary", () => {
  //   const rowVisibleRange = {start: 3, stop: 100};
  //   const index5 = 5;
  //   const index6 = 6;
  //   const data = makeData([
  //     ["a", "x", 0],
  //     ["a", "z", 1],
  //     ["a", "x", 2],
  //     ["a", "y", 3],
  //     ["a", "z", 4],
  //     ["a", "y", index5],
  //     ["b", "z", index6],
  //     ["b", "x", 7],
  //     ["b", "y", 8],
  //     ["b", "z", 9],
  //     ["b", "y", 10],
  //   ]);
  //
  //   const gm = newGroupingManager(data.rows);
  //   it("should return rows in the the same order", () =>
  //     expect(gm.rowsOrdered).toEqual(data.rows)
  //   );
  //
  //   const hiddenRows = [0, 1, 2, 3, 4, 7, 8, 9, 10];
  //
  //   hiddenRows.forEach(rn =>
  //     it("should hide row: " + rn, () => expect(gm.shouldHide(rn, rowVisibleRange)).toEqual(true)));
  //
  //   const visibleRows = [index5, index6];
  //   visibleRows.forEach(rn => it("should display row: " + rn, () =>
  //     expect(gm.shouldHide(rn, rowVisibleRange)).toEqual(false))
  //   );
  //
  //
  //   it(`row number ${index5} should has correct height and top `, () => {
  //     const top = 3;
  //     const style = gm.mapStyle(index5, rowVisibleRange, newStyleWithTop(top));
  //     expect(style.height).toEqual(3);
  //     expect(style.top).toEqual(0);
  //   });
  //
  //   it(`row number ${index6} should has correct height and top `, () => {
  //     const top = 6;
  //     const style = gm.mapStyle(index6, rowVisibleRange, newStyleWithTop(top));
  //     expect(style.height).toEqual(5);
  //     expect(style.top).toEqual(top);
  //   });
  // });
});
