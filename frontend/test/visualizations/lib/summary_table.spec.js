import orderBy from "lodash.orderby";
import isEqual from "lodash.isequal";
import zip from "lodash.zip";
import set from "lodash.set";
import { buildIndexGenerator } from "metabase/visualizations/lib/table_virtualized";

const orderByIndexes = array =>
  orderBy(array, [
    "rowStartIndex",
    "rowStopIndex",
    "columnStartIndex",
    "columnStopIndex",
  ]);

const expectToBeEqual = (generated, expected) => {
  expect(generated.length).toBe(expected.length);
  const generatedSorted = orderByIndexes(generated);

  const expectedSorted = orderByIndexes(expected);
  zip(generatedSorted, expectedSorted).forEach(([gen, exp]) =>
    expect(isEqual(gen, exp)).toBe(true),
  );
};

const createGroups = (...args) =>
  args.reduce((acc, [key, value]) => set(acc, key, value), []);

describe("metabase/visualization/lib/summary_table.js", () => {
  describe("index builders", () => {
    describe("given no groups, visible column indexes: [1..2], rows indexes: [7...10] ", () => {
      const window = {
        windowRowStartIndex: 7,
        windowRowStopIndex: 10,
        windowColumnStartIndex: 1,
        windowColumnStopIndex: 2,
      };
      describe("given indexGenerator", () => {
        const generator = buildIndexGenerator();
        it("should return 8 elements", () => {
          const expectedElements = [
            {
              rowStartIndex: 7,
              rowStopIndex: 7,
              columnStartIndex: 1,
              columnStopIndex: 1,
            },
            {
              rowStartIndex: 8,
              rowStopIndex: 8,
              columnStartIndex: 1,
              columnStopIndex: 1,
            },
            {
              rowStartIndex: 9,
              rowStopIndex: 9,
              columnStartIndex: 1,
              columnStopIndex: 1,
            },
            {
              rowStartIndex: 10,
              rowStopIndex: 10,
              columnStartIndex: 1,
              columnStopIndex: 1,
            },
            {
              rowStartIndex: 7,
              rowStopIndex: 7,
              columnStartIndex: 2,
              columnStopIndex: 2,
            },
            {
              rowStartIndex: 8,
              rowStopIndex: 8,
              columnStartIndex: 2,
              columnStopIndex: 2,
            },
            {
              rowStartIndex: 9,
              rowStopIndex: 9,
              columnStartIndex: 2,
              columnStopIndex: 2,
            },
            {
              rowStartIndex: 10,
              rowStopIndex: 10,
              columnStartIndex: 2,
              columnStopIndex: 2,
            },
          ];
          const res = generator(window);
          expectToBeEqual(res, expectedElements);
        });
      });

      describe(
        "given grouped columns: [0,0], [1,7], [8,10] for row 5 and [0,5], [6,10] for row 6 " +
          ", groups, visible column indexes: [1..2], rows indexes: [5...6] ",
        () => {
          const window = {
            windowRowStartIndex: 5,
            windowRowStopIndex: 6,
            windowColumnStartIndex: 0,
            windowColumnStopIndex: 1,
          };
          const groupsForRows = createGroups(
            [5, { 0: 0, 1: 7, 8: 10 }],
            [6, { 0: 5, 6: 10 }],
          );
          describe("given headerIndexGenerator", () => {
            const generator = buildIndexGenerator({ groupsForRows });
            it("should return 3 elements", () => {
              const expectedElements = [
                {
                  rowStartIndex: 5,
                  rowStopIndex: 5,
                  columnStartIndex: 0,
                  columnStopIndex: 0,
                },
                {
                  rowStartIndex: 5,
                  rowStopIndex: 5,
                  columnStartIndex: 1,
                  columnStopIndex: 7,
                },
                {
                  rowStartIndex: 6,
                  rowStopIndex: 6,
                  columnStartIndex: 0,
                  columnStopIndex: 5,
                },
              ];
              const res = generator(window);
              expectToBeEqual(res, expectedElements);
            });
          });
        },
      );

      describe(
        "given grouped rows: [0,0], [1,7], [8,10] for column 0 and [0,5], [6,6] for column 2 " +
          ", groups, visible column indexes: [0..2], rows indexes: [4...6] ",
        () => {
          const window = {
            windowRowStartIndex: 4,
            windowRowStopIndex: 6,
            windowColumnStartIndex: 0,
            windowColumnStopIndex: 2,
          };
          const groupsForColumns = createGroups(
            [0, { 0: 0, 1: 7, 8: 10 }],
            [2, { 0: 5, 6: 6 }],
          );
          describe("given headerIndexGenerator", () => {
            const generator = buildIndexGenerator({ groupsForColumns });
            it("should return 6 elements", () => {
              const expectedElements = [
                {
                  rowStartIndex: 1,
                  rowStopIndex: 7,
                  columnStartIndex: 0,
                  columnStopIndex: 0,
                },
                {
                  rowStartIndex: 4,
                  rowStopIndex: 4,
                  columnStartIndex: 1,
                  columnStopIndex: 1,
                },
                {
                  rowStartIndex: 5,
                  rowStopIndex: 5,
                  columnStartIndex: 1,
                  columnStopIndex: 1,
                },
                {
                  rowStartIndex: 6,
                  rowStopIndex: 6,
                  columnStartIndex: 1,
                  columnStopIndex: 1,
                },
                {
                  rowStartIndex: 0,
                  rowStopIndex: 5,
                  columnStartIndex: 2,
                  columnStopIndex: 2,
                },
                {
                  rowStartIndex: 6,
                  rowStopIndex: 6,
                  columnStartIndex: 2,
                  columnStopIndex: 2,
                },
              ];
              const res = generator(window);
              expectToBeEqual(res, expectedElements);
            });
          });
        },
      );

      describe(
        "given grouped columns: [0,0], [1,1], [2,2], [3,7], [8,10] for row 5 and [0,0], [1,1], [2,2], [3,11] for row 6 " +
          "and grouped rows: [0,20] for column 1, [1,5], [6,6] for column 2" +
          ", groups, visible column indexes: [1..3], rows indexes: [4...6] ",
        () => {
          const window = {
            windowRowStartIndex: 4,
            windowRowStopIndex: 6,
            windowColumnStartIndex: 1,
            windowColumnStopIndex: 3,
          };
          const groupsForRows = createGroups(
            [5, { 0: 0, 1: 1, 2: 2, 3: 7, 8: 10 }],
            [6, { 0: 0, 1: 1, 2: 2, 3: 11 }],
          );
          const groupsForColumns = createGroups(
            [1, { 0: 20 }],
            [2, { 1: 5, 6: 16 }],
          );
          describe("given headerIndexGenerator", () => {
            const generator = buildIndexGenerator({
              groupsForRows,
              groupsForColumns,
            });
            it("should return 6 elements", () => {
              const expectedElements = [
                {
                  rowStartIndex: 4,
                  rowStopIndex: 4,
                  columnStartIndex: 3,
                  columnStopIndex: 3,
                },
                {
                  rowStartIndex: 0,
                  rowStopIndex: 20,
                  columnStartIndex: 1,
                  columnStopIndex: 1,
                },
                {
                  rowStartIndex: 1,
                  rowStopIndex: 5,
                  columnStartIndex: 2,
                  columnStopIndex: 2,
                },
                {
                  rowStartIndex: 5,
                  rowStopIndex: 5,
                  columnStartIndex: 3,
                  columnStopIndex: 7,
                },
                {
                  rowStartIndex: 6,
                  rowStopIndex: 16,
                  columnStartIndex: 2,
                  columnStopIndex: 2,
                },
                {
                  rowStartIndex: 6,
                  rowStopIndex: 6,
                  columnStartIndex: 3,
                  columnStopIndex: 11,
                },
              ];
              const res = generator(window);
              expectToBeEqual(res, expectedElements);
            });
          });
        },
      );

      describe(
        "given grouped columns: [0,1], [2,8] for row 5 and [0,5] for row 6 " +
          "and grouped rows: [0,0] [1,1], [2,2],[3,3],[4,4], [5,5], [6,6], [7,7], [8,8],[9,20] for column 1" +
          ", groups, visible column indexes: [1..3], rows indexes: [5...6] ",
        () => {
          const window = {
            windowRowStartIndex: 5,
            windowRowStopIndex: 6,
            windowColumnStartIndex: 1,
            windowColumnStopIndex: 3,
          };
          const groupsForRows = createGroups(
            [5, { 0: 1, 2: 8 }],
            [6, { 0: 5 }],
          );
          const groupsForColumns = createGroups([
            1,
            { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 20 },
          ]);
          describe("given headerIndexGenerator", () => {
            const generator = buildIndexGenerator({
              groupsForRows,
              groupsForColumns,
            });
            it("should return 3 elements", () => {
              const expectedElements = [
                {
                  rowStartIndex: 5,
                  rowStopIndex: 5,
                  columnStartIndex: 0,
                  columnStopIndex: 1,
                },
                {
                  rowStartIndex: 5,
                  rowStopIndex: 5,
                  columnStartIndex: 2,
                  columnStopIndex: 8,
                },
                {
                  rowStartIndex: 6,
                  rowStopIndex: 6,
                  columnStartIndex: 0,
                  columnStopIndex: 5,
                },
              ];
              const res = generator(window);
              expectToBeEqual(res, expectedElements);
            });
          });
        },
      );
    });
  });
});
