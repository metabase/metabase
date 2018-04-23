import { GroupingManager } from "metabase/visualizations/lib/GroupingManager";
import { TYPE } from "metabase/lib/types";

function makeData(rows) {
  return {
    rows: rows,
    cols: [
      { name: "C1", display_name: "Column 1", base_type: TYPE.Text },
      { name: "C2", display_name: "Column 2", base_type: TYPE.Text },
      { name: "C3", display_name: "Column 3", base_type: TYPE.Numeric },
    ],
  };
}

describe("GroupingManager", () => {
  describe("given empty GroupingManager", () => {
    let gm = new GroupingManager([]);
    it("should return empty array", () => {
      expect(gm.rowsOrdered).toEqual([]);
    });
  });

  describe("given rows in correct order", () => {
    let data = makeData([
      ["a", "x", 1],
      ["a", "y", 2],
      ["a", "z", 3],
      ["b", "z", 4],
      ["b", "x", 5],
      ["b", "y", 6],
    ]);
    let gm = new GroupingManager(data.rows);
    it("should return rows in the the same order", () => {
      expect(gm.rowsOrdered).toEqual(data.rows);
    });

    let hiddenRows = [1, 2, 4, 5];
    it("should hide rows: " + hiddenRows, () => {
      hiddenRows.forEach(rn => expect(gm.shouldHide(rn)).toEqual(true));
    });

    let visibleRows = [0, 3];
    it("should display rows: " + visibleRows, () => {
      visibleRows.forEach(rn => expect(gm.shouldHide(rn)).toEqual(false));
    });
  });

  describe("given rows in incorrect order", () => {
    let data = makeData([
      ["a", "x", 1],
      ["c", "z", 4],
      ["b", "x", 5],
      ["a", "y", 2],
      ["a", "z", 3],
      ["b", "y", 6],
    ]);
    let expectedData = makeData([
      ["a", "x", 1],
      ["a", "y", 2],
      ["a", "z", 3],
      ["c", "z", 4],
      ["b", "x", 5],
      ["b", "y", 6],
    ]);
    let gm = new GroupingManager(data.rows);
    it("should return rows in group order", () => {
      expect(gm.rowsOrdered).toEqual(expectedData.rows);
    });

    let hiddenRows = [1, 2, 5];
    it("should hide rows: " + hiddenRows, () => {
      hiddenRows.forEach(rn => expect(gm.shouldHide(rn)).toEqual(true));
    });

    let visibleRows = [0, 3, 4];
    it("should display rows: " + visibleRows, () => {
      visibleRows.forEach(rn => expect(gm.shouldHide(rn)).toEqual(false));
    });

    const styleMock = { height: 1 };
    it("should have correct row height", () => {
      expect(gm.mapStyle(0, 0, styleMock).height).toEqual(3);
      expect(gm.mapStyle(3, 0, styleMock).height).toEqual(1);
      expect(gm.mapStyle(4, 0, styleMock).height).toEqual(2);
    });
  });
});
