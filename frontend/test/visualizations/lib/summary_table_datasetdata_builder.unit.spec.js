import { buildDatasetData } from "metabase/visualizations/lib/summary_table_datasetdata_builder";
import { TYPE } from "metabase/lib/types";
import isEqual from "lodash.isequal";
import zip from "lodash.zip";
import type { Column } from "metabase/meta/types/Dataset";
import { enrichSettings } from "metabase/visualizations/lib/settings/summary_table";
import { buildResultProvider } from "metabase/visualizations/lib/summary_table";

const columnText1 = {
  name: "C1",
  display_name: "Column 1",
  base_type: TYPE.Text,
  source: "breakout",
};
const columnText2 = {
  name: "C2",
  display_name: "Column 2",
  base_type: TYPE.Text,
  source: "breakout",
};
const columnText3 = {
  name: "C3",
  display_name: "Column 3",
  base_type: TYPE.Text,
  source: "breakout",
};
const columnNumeric1 = {
  name: "CN1",
  display_name: "Column N 1",
  base_type: TYPE.Number,
  source: "aggregation",
};
const columnNumeric2 = {
  name: "CN2",
  display_name: "Column N 2",
  base_type: TYPE.Number,
  source: "aggregation",
};
const allColumns = [
  columnText1,
  columnText2,
  columnText3,
  columnNumeric1,
  columnNumeric2,
];

const row1 = ["a", "d", "g", 3, 5];
const row2 = ["a", "e", "h", 4, 7];
const row3 = ["b", "d", "h", 1, -12];
const row4 = ["c", "e", "h", 1, 9];
const row5 = ["c", "e", "i", -1, 9];
const allRows = [row1, row2, row3, row4, row5];

const rawOrderedDatasetData = {
  rows: allRows,
  cols: allColumns,
  columns: allColumns.map(p => p.name),
};

const sortOrderForRawDatasetData = rawOrderedDatasetData.columns.map(
  columnName => ["asc", columnName],
);

const createColumnHeader = (
  column: Column,
  value,
  columnSpan,
  displayText,
) => ({
  column,
  columnSpan: columnSpan || 1,
  ...(value && { value }),
  ...(displayText && { displayText }),
});

const rowsAreEqual = (computedRow, expectedRow) => {
  zip(computedRow, expectedRow).forEach(([computedValue, expectedValue]) => {
    if (expectedValue) {
      expect(isEqual(computedValue, expectedValue)).toBe(true);
    } else {
      expect(!computedValue).toBe(true);
    }
  });
};

const rowListsAreEqual = (
  computedList,
  expectedList,
  additionalRowComparer = null,
) => {
  expect(computedList.length).toEqual(expectedList.length);
  const zippedRows = zip(computedList, expectedList);
  zippedRows.forEach(([computedRow, expectedRow]) =>
    rowsAreEqual(computedRow, expectedRow),
  );
  if (additionalRowComparer) {
    zippedRows.forEach(([computedRow, expectedRow]) =>
      expect(additionalRowComparer(computedRow, expectedRow)).toBe(true),
    );
  }
};

const dataRowListsAreEqual = (computedList, expectedList) =>
  rowListsAreEqual(
    computedList,
    expectedList,
    (r1, r2) => r1.isTotalColumnIndex === r2.isTotalColumnIndex,
  );

const getAllColumns = ({ groupsSources, columnsSource, valuesSources }) => [
  ...(groupsSources || []),
  ...(columnsSource || []),
  ...(valuesSources || []),
];

const setTotalIndex = (row, index) => {
  row.isTotalColumnIndex = index;
  return row;
};

describe("summary_table_datasetdata_builder.js", () => {
  describe("datasetData builder for summaryTable", () => {
    const resultsProvider = buildResultProvider(
      rawOrderedDatasetData,
      [rawOrderedDatasetData],
      sortOrderForRawDatasetData,
    );
    const toSettings = baseSettings =>
      enrichSettings(baseSettings, allColumns, getAllColumns(baseSettings));

    describe(
      "header tests, notation: " +
        "_columnName_(_value_, _number_) === {column:_columnName_, value: _value_, columnSpan: _number_}:ColumnHeader",
      () => {
        describe("given rawOrderedDatasetData and settings with groupsSources: C1, C2, C3 and valuesSources CN1, CN2", () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2", "C3"],
            valuesSources: ["CN1", "CN2"],
          });

          const { columnsHeaders, cols } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return columnsHeader with 1 row: C1, C2, C3, CN1, CN2", () => {
            const expectedRow = allColumns.map(columnName =>
              createColumnHeader(columnName),
            );
            rowListsAreEqual(columnsHeaders, [expectedRow]);
          });
          it("builder should return cols: C1, C2, C3, CN1, CN2", () => {
            rowsAreEqual(cols, allColumns);
          });
        });

        describe("given rawOrderedDatasetData and settings with groupsSources: C1, C3 and valuesSources CN2", () => {
          const settings = toSettings({
            groupsSources: ["C1", "C3"],
            valuesSources: ["CN2"],
          });
          const expectedColumns = [columnText1, columnText3, columnNumeric2];

          const { columnsHeaders, cols } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return columnsHeader with 1 row: C1, C3, CN2", () => {
            const expectedRow = expectedColumns.map(columnName =>
              createColumnHeader(columnName),
            );
            rowListsAreEqual(columnsHeaders, [expectedRow]);
          });
          it("builder should return cols: C1, C3, CN2", () => {
            rowsAreEqual(cols, expectedColumns);
          });
        });

        describe("given rawOrderedDatasetData and settings with groupsSources: C1, C2 and columnsSource: C3 and valuesSources CN1, CN2", () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2"],
            columnsSource: ["C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C3: { isAscSortOrder: true, showTotals: false },
            },
          });
          const expectedColumns = [
            columnText1,
            columnText2,
            columnNumeric1,
            columnNumeric2,
            columnNumeric1,
            columnNumeric2,
            columnNumeric1,
            columnNumeric2,
          ];

          const { columnsHeaders, cols } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );

          it(
            "builder should return columnsHeader with 2 rows: " +
              "[null, null, C3(g, 2), null, C3(h, 2), null, C3(i, 2), null] " +
              "[C1,   C2,   CN1,      CN2,  CN1,      CN2,  CN1,      CN2]",
            () => {
              const topRow = [
                null,
                null,
                createColumnHeader(columnText3, "g", 2),
                null,
                createColumnHeader(columnText3, "h", 2),
                null,
                createColumnHeader(columnText3, "i", 2),
                null,
              ];
              const bottomRow = expectedColumns.map(columnName =>
                createColumnHeader(columnName),
              );

              rowListsAreEqual(columnsHeaders, [topRow, bottomRow]);
            },
          );
          it("builder should return cols: C1, C2, CN1, CN2, CN1, CN2,  CN1, CN2", () => {
            rowsAreEqual(cols, expectedColumns);
          });
        });

        describe(
          "given rawOrderedDatasetData and settings with groupsSources: C1, C2 and columnsSource: C3 and valuesSources CN1, CN2" +
            "where we select 'show totals' for 'C3",
          () => {
            const settings = toSettings({
              groupsSources: ["C1", "C2"],
              columnsSource: ["C3"],
              valuesSources: ["CN1", "CN2"],
              columnNameToMetadata: {
                C3: { isAscSortOrder: true, showTotals: true },
              },
            });
            const expectedColumns = [
              columnText1,
              columnText2,
              columnNumeric1,
              columnNumeric2,
              columnNumeric1,
              columnNumeric2,
              columnNumeric1,
              columnNumeric2,
              columnNumeric1,
              columnNumeric2,
            ];

            const { columnsHeaders, cols } = buildDatasetData(
              settings,
              rawOrderedDatasetData,
              resultsProvider,
            );

            it(
              "builder should return columnsHeader with 2 rows: " +
                "[null, null, C3(g, 2), null, C3(h, 2), null, C3(i, 2), null, C3(null, 2), null] " +
                "[C1,   C2,   CN1,      CN2,  CN1,      CN2,  CN1,      CN2,  CN1,         CN2]",
              () => {
                const topRow = [
                  null,
                  null,
                  createColumnHeader(columnText3, "g", 2),
                  null,
                  createColumnHeader(columnText3, "h", 2),
                  null,
                  createColumnHeader(columnText3, "i", 2),
                  null,
                  createColumnHeader(columnText3, null, 2, "Grand totals"),
                  null,
                ];
                const bottomRow = expectedColumns.map(columnName =>
                  createColumnHeader(columnName),
                );

                rowListsAreEqual(columnsHeaders, [topRow, bottomRow]);
              },
            );
            it("builder should return cols: C1, C2, CN1, CN2, CN1, CN2,  CN1, CN2", () => {
              rowsAreEqual(cols, expectedColumns);
            });
          },
        );

        describe(
          "given rawOrderedDatasetData and settings with groupsSources: C1, C2 and columnsSource: C3 and valuesSources CN1, CN2" +
            "where C3 is sort desc",
          () => {
            const settings = toSettings({
              groupsSources: ["C1", "C2"],
              columnsSource: ["C3"],
              valuesSources: ["CN1", "CN2"],
              columnNameToMetadata: {
                C3: { isAscSortOrder: false, showTotals: false },
              },
            });
            const expectedColumns = [
              columnText1,
              columnText2,
              columnNumeric1,
              columnNumeric2,
              columnNumeric1,
              columnNumeric2,
              columnNumeric1,
              columnNumeric2,
            ];

            const { columnsHeaders, cols } = buildDatasetData(
              settings,
              rawOrderedDatasetData,
              resultsProvider,
            );

            it(
              "builder should return columnsHeader with 2 rows: " +
                "[null, null, C3(i, 2), null, C3(h, 2), null, C3(g, 2), null] " +
                "[C1,   C2,   CN1,      CN2,  CN1,      CN2,  CN1,      CN2]",
              () => {
                const topRow = [
                  null,
                  null,
                  createColumnHeader(columnText3, "i", 2),
                  null,
                  createColumnHeader(columnText3, "h", 2),
                  null,
                  createColumnHeader(columnText3, "g", 2),
                  null,
                ];
                const bottomRow = expectedColumns.map(columnName =>
                  createColumnHeader(columnName),
                );

                rowListsAreEqual(columnsHeaders, [topRow, bottomRow]);
              },
            );
            it("builder should return cols: C1, C2, CN1, CN2, CN1, CN2,  CN1, CN2", () => {
              rowsAreEqual(cols, expectedColumns);
            });
          },
        );

        describe(
          "given rawOrderedDatasetData and settings with groupsSources: C1, C2 and columnsSource: C3 and valuesSources CN1, CN2" +
            "where C3 is sort desc and has totals",
          () => {
            const settings = toSettings({
              groupsSources: ["C1", "C2"],
              columnsSource: ["C3"],
              valuesSources: ["CN1", "CN2"],
              columnNameToMetadata: {
                C3: { isAscSortOrder: false, showTotals: true },
              },
            });
            const expectedColumns = [
              columnText1,
              columnText2,
              columnNumeric1,
              columnNumeric2,
              columnNumeric1,
              columnNumeric2,
              columnNumeric1,
              columnNumeric2,
              columnNumeric1,
              columnNumeric2,
            ];

            const { columnsHeaders, cols } = buildDatasetData(
              settings,
              rawOrderedDatasetData,
              resultsProvider,
            );

            it(
              "builder should return columnsHeader with 2 rows: " +
                "[null, null, C3(i, 2), null, C3(h, 2), null, C3(g, 2), null] " +
                "[C1,   C2,   CN1,      CN2,  CN1,      CN2,  CN1,      CN2]",
              () => {
                const topRow = [
                  null,
                  null,
                  createColumnHeader(columnText3, "i", 2),
                  null,
                  createColumnHeader(columnText3, "h", 2),
                  null,
                  createColumnHeader(columnText3, "g", 2),
                  null,
                  createColumnHeader(columnText3, null, 2, "Grand totals"),
                  null,
                ];
                const bottomRow = expectedColumns.map(columnName =>
                  createColumnHeader(columnName),
                );
                rowListsAreEqual(columnsHeaders, [topRow, bottomRow]);
              },
            );
            it("builder should return cols: C1, C2, CN1, CN2, CN1, CN2,  CN1, CN2, CN1, CN2", () => {
              rowsAreEqual(cols, expectedColumns);
            });
          },
        );

        describe("given rawOrderedDatasetData and settings with groupsSources: C1, C2 and columnsSource: C3 and valuesSources CN2", () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2"],
            columnsSource: ["C3"],
            valuesSources: ["CN2"],
            columnNameToMetadata: {
              C3: { isAscSortOrder: true, showTotals: false },
            },
          });

          const { columnsHeaders, cols } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it(
            "builder should return columnsHeader with 1 row: " +
              "[C1,   C2,  C3(g, 1), C3(h, 1), C3(i, 1)]",
            () => {
              const expectedRow = [
                createColumnHeader(columnText1),
                createColumnHeader(columnText2),
                createColumnHeader(columnText3, "g"),
                createColumnHeader(columnText3, "h"),
                createColumnHeader(columnText3, "i"),
              ];

              rowListsAreEqual(columnsHeaders, [expectedRow]);
            },
          );

          it("builder should return cols: C1, C2, CN2, CN2, CN2", () => {
            const expectedColumns = [
              columnText1,
              columnText2,
              columnNumeric2,
              columnNumeric2,
              columnNumeric2,
            ];
            rowsAreEqual(cols, expectedColumns);
          });
        });

        describe(
          "given rawOrderedDatasetData and settings with groupsSources: C1, C2 and columnsSource: C3 and valuesSources CN2" +
            "where C3 has totals",
          () => {
            const settings = toSettings({
              groupsSources: ["C1", "C2"],
              columnsSource: ["C3"],
              valuesSources: ["CN2"],
              columnNameToMetadata: {
                C3: { isAscSortOrder: true, showTotals: true },
              },
            });

            const { columnsHeaders, cols } = buildDatasetData(
              settings,
              rawOrderedDatasetData,
              resultsProvider,
            );
            it(
              "builder should return columnsHeader with 1 row: " +
                "[C1,   C2,  C3(g, 1), C3(h, 1), C3(i, 1), C3(null, 1, 'Grand totals')]",
              () => {
                const expectedRow = [
                  createColumnHeader(columnText1),
                  createColumnHeader(columnText2),
                  createColumnHeader(columnText3, "g"),
                  createColumnHeader(columnText3, "h"),
                  createColumnHeader(columnText3, "i"),
                  createColumnHeader(columnText3, null, 1, "Grand totals"),
                ];

                rowListsAreEqual(columnsHeaders, [expectedRow]);
              },
            );

            it("builder should return cols: C1, C2, CN2, CN2, CN2, CN2", () => {
              const expectedColumns = [
                columnText1,
                columnText2,
                columnNumeric2,
                columnNumeric2,
                columnNumeric2,
                columnNumeric2,
              ];
              rowsAreEqual(cols, expectedColumns);
            });
          },
        );
      },
    );

    describe("rows tests" + "given results provider:", () => {
      describe(
        "given rawOrderedDatasetData and settings with groupsSources: C1, C2, C3 and valuesSources CN1, CN2, " +
          "where we don't have selected 'show totals' for any column",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2", "C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C1: { showTotals: false, isAscSortOrder: true },
              C2: { showTotals: false, isAscSortOrder: true },
              C3: { showTotals: false, isAscSortOrder: true },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return all rows from rawOrderedDatasetData in the same order", () => {
            dataRowListsAreEqual(rows, rawOrderedDatasetData.rows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: C1, C2, C3 and valuesSources CN1, CN2, " +
          "where we have selected 'show totals' for C1",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2", "C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C1: { showTotals: true, isAscSortOrder: true },
              C2: { showTotals: false, isAscSortOrder: true },
              C3: { showTotals: false, isAscSortOrder: true },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return all rows from rawOrderedDatasetData and grand totals row in the same order like rawOrderedDatasetData", () => {
            const expectedRows = [
              ...allRows,
              setTotalIndex([null, null, null, 8, 18], 0),
            ];
            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: C1, C2, C3 and valuesSources CN1, CN2, " +
          "where we have selected 'show totals' for C1 and C3",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2", "C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C1: { showTotals: true, isAscSortOrder: true },
              C2: { showTotals: false, isAscSortOrder: true },
              C3: { showTotals: true, isAscSortOrder: true },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return all rows from rawOrderedDatasetData and grand totals row and totals rows for C3 in the same order like rawOrderedDatasetData", () => {
            const row1 = ["a", "d", "g", 3, 5];
            const totalRow_ad = setTotalIndex(["a", "d", null, 3, 5], 2);
            const row2 = ["a", "e", "h", 4, 7];
            const totalRow_ae = setTotalIndex(["a", "e", null, 4, 7], 2);
            const row3 = ["b", "d", "h", 1, -12];
            const totalRow_bd = setTotalIndex(["b", "d", null, 1, -12], 2);
            const row4 = ["c", "e", "h", 1, 9];
            const row5 = ["c", "e", "i", -1, 9];
            const totalRow_ce = setTotalIndex(["c", "e", null, 0, 18], 2);
            const grandTotals = setTotalIndex([null, null, null, 8, 18], 0);

            const expectedRows = [
              row1,
              totalRow_ad,
              row2,
              totalRow_ae,
              row3,
              totalRow_bd,
              row4,
              row5,
              totalRow_ce,
              grandTotals,
            ];
            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: C1, C2, C3 and valuesSources CN1, CN2, " +
          "where we have selected 'show totals' for C1 and C2" +
          "and C2 is ordered 'desc",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2", "C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C1: { showTotals: true, isAscSortOrder: true },
              C2: { showTotals: true, isAscSortOrder: false },
              C3: { showTotals: false, isAscSortOrder: true },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return all rows from rawOrderedDatasetData and grand totals row and totals rows for C3 reordered", () => {
            const row1 = ["a", "e", "h", 4, 7];
            const row2 = ["a", "d", "g", 3, 5];
            const totalRow_a = setTotalIndex(["a", null, null, 7, 12], 1);
            const row3 = ["b", "d", "h", 1, -12];
            const totalRow_b = setTotalIndex(["b", null, null, 1, -12], 1);
            const row4 = ["c", "e", "h", 1, 9];
            const row5 = ["c", "e", "i", -1, 9];
            const totalRow_c = setTotalIndex(["c", null, null, 0, 18], 1);
            const grandTotals = setTotalIndex([null, null, null, 8, 18], 0);

            const expectedRows = [
              row1,
              row2,
              totalRow_a,
              row3,
              totalRow_b,
              row4,
              row5,
              totalRow_c,
              grandTotals,
            ];

            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: C1, C2, columnSource: C3 and valuesSources CN1, CN2, " +
          "where we don't select 'show totals' for any column",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2"],
            columnsSource: ["C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C1: { showTotals: false, isAscSortOrder: true },
              C2: { showTotals: false, isAscSortOrder: true },
              C3: { showTotals: false, isAscSortOrder: true },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return pivoted rows", () => {
            // C1, C2, 'g'(CN1, CN2), 'h'(CN1, CN2), 'i'(CN1, CN2)
            const expectedRows = [
              ["a", "d", 3, 5, null, null, null, null],
              ["a", "e", null, null, 4, 7, null, null],
              ["b", "d", null, null, 1, -12, null, null],
              ["c", "e", null, null, 1, 9, -1, 9],
            ];
            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: C1, C2, columnSource: C3 and valuesSources CN1, CN2, " +
          "where we select show totals' for C3",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2"],
            columnsSource: ["C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C1: { showTotals: false, isAscSortOrder: true },
              C2: { showTotals: false, isAscSortOrder: true },
              C3: { showTotals: true, isAscSortOrder: true },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return pivoted rows", () => {
            // C1, C2, 'g'(CN1, CN2), 'h'(CN1, CN2), 'i'(CN1, CN2) grandTotals(CN1,CN2)
            const expectedRows = [
              ["a", "d", 3, 5, null, null, null, null, 3, 5],
              ["a", "e", null, null, 4, 7, null, null, 4, 7],
              ["b", "d", null, null, 1, -12, null, null, 1, -12],
              ["c", "e", null, null, 1, 9, -1, 9, 0, 18],
            ];

            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: C1, C2 columnSource: C3 and valuesSources CN1, CN2, " +
          "where we select 'show totals' for 'C2'",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2"],
            columnsSource: ["C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C1: { showTotals: false, isAscSortOrder: true },
              C2: { showTotals: true, isAscSortOrder: true },
              C3: { showTotals: false, isAscSortOrder: true },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return pivoted and pivoted totals rows", () => {
            // C1, C2, 'g'(CN1, CN2), 'h'(CN1, CN2), 'i'(CN1, CN2)
            const expectedRows = [
              ["a", "d", 3, 5, null, null, null, null],
              ["a", "e", null, null, 4, 7, null, null],
              setTotalIndex(["a", null, 3, 5, 4, 7, null, null], 1),
              ["b", "d", null, null, 1, -12, null, null],
              setTotalIndex(["b", null, null, null, 1, -12, null, null], 1),
              ["c", "e", null, null, 1, 9, -1, 9],
              setTotalIndex(["c", null, null, null, 1, 9, -1, 9], 1),
            ];
            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: C1, C2 columnSource: C3 and valuesSources CN1, CN2, " +
          "where we select 'show totals' for 'C2' and 'C3'",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2"],
            columnsSource: ["C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C1: { showTotals: false, isAscSortOrder: true },
              C2: { showTotals: true, isAscSortOrder: true },
              C3: { showTotals: true, isAscSortOrder: true },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return pivoted and pivoted totals rows", () => {
            // C1, C2, 'g'(CN1, CN2), 'h'(CN1, CN2), 'i'(CN1, CN2)
            const expectedRows = [
              ["a", "d", 3, 5, null, null, null, null, 3, 5],
              ["a", "e", null, null, 4, 7, null, null, 4, 7],
              setTotalIndex(["a", null, 3, 5, 4, 7, null, null, 7, 12], 1),
              ["b", "d", null, null, 1, -12, null, null, 1, -12],
              setTotalIndex(
                ["b", null, null, null, 1, -12, null, null, 1, -12],
                1,
              ),
              ["c", "e", null, null, 1, 9, -1, 9, 0, 18],
              setTotalIndex(["c", null, null, null, 1, 9, -1, 9, 0, 18], 1),
            ];
            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: C1, C2 columnSource: C3 and valuesSources CN1, CN2, " +
          "where we select 'show totals' for 'C1' and 'C2",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2"],
            columnsSource: ["C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C1: { showTotals: true, isAscSortOrder: true },
              C2: { showTotals: true, isAscSortOrder: true },
              C3: { showTotals: false, isAscSortOrder: true },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return pivoted and pivoted (grand)totals rows", () => {
            // C1, C2, 'g'(CN1, CN2), 'h'(CN1, CN2), 'i'(CN1, CN2)
            const expectedRows = [
              ["a", "d", 3, 5, null, null, null, null],
              ["a", "e", null, null, 4, 7, null, null],
              setTotalIndex(["a", null, 3, 5, 4, 7, null, null], 1),
              ["b", "d", null, null, 1, -12, null, null],
              setTotalIndex(["b", null, null, null, 1, -12, null, null], 1),
              ["c", "e", null, null, 1, 9, -1, 9],
              setTotalIndex(["c", null, null, null, 1, 9, -1, 9], 1),
              setTotalIndex([null, null, 3, 5, 6, 4, -1, 9], 0),
            ];
            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: C1, desc C2 columnSource: C3 and valuesSources CN1, CN2, " +
          "where we select 'show totals' for 'C1' and 'C2",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2"],
            columnsSource: ["C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C1: { showTotals: true, isAscSortOrder: true },
              C2: { showTotals: true, isAscSortOrder: false },
              C3: { showTotals: false, isAscSortOrder: true },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return pivoted and pivoted (grand)totals rows in correct order", () => {
            // C1, C2, 'g'(CN1, CN2), 'h'(CN1, CN2), 'i'(CN1, CN2)
            const expectedRows = [
              ["a", "e", null, null, 4, 7, null, null],
              ["a", "d", 3, 5, null, null, null, null],
              setTotalIndex(["a", null, 3, 5, 4, 7, null, null], 1),
              ["b", "d", null, null, 1, -12, null, null],
              setTotalIndex(["b", null, null, null, 1, -12, null, null], 1),
              ["c", "e", null, null, 1, 9, -1, 9],
              setTotalIndex(["c", null, null, null, 1, 9, -1, 9], 1),
              setTotalIndex([null, null, 3, 5, 6, 4, -1, 9], 0),
            ];

            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: C1, desc C2 columnSource: C3 and valuesSources CN1, CN2, " +
          "where we select 'show totals' for 'C1' and 'C2 and 'C3",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2"],
            columnsSource: ["C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C1: { showTotals: true, isAscSortOrder: true },
              C2: { showTotals: true, isAscSortOrder: false },
              C3: { showTotals: true, isAscSortOrder: true },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return pivoted and pivoted (grand)totals rows in correct order", () => {
            // C1, C2, 'g'(CN1, CN2), 'h'(CN1, CN2), 'i'(CN1, CN2)
            const expectedRows = [
              ["a", "e", null, null, 4, 7, null, null, 4, 7],
              ["a", "d", 3, 5, null, null, null, null, 3, 5],
              setTotalIndex(["a", null, 3, 5, 4, 7, null, null, 7, 12], 1),
              ["b", "d", null, null, 1, -12, null, null, 1, -12],
              setTotalIndex(
                ["b", null, null, null, 1, -12, null, null, 1, -12],
                1,
              ),
              ["c", "e", null, null, 1, 9, -1, 9, 0, 18],
              setTotalIndex(["c", null, null, null, 1, 9, -1, 9, 0, 18], 1),
              setTotalIndex([null, null, 3, 5, 6, 4, -1, 9, 8, 18], 0),
            ];

            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: desc C1, desc C2 columnSource: desc C3 and valuesSources CN1,CN2, " +
          "where we select 'show totals' for 'C1' and 'C2",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2"],
            columnsSource: ["C3"],
            valuesSources: ["CN1", "CN2"],
            columnNameToMetadata: {
              C1: { showTotals: true, isAscSortOrder: false },
              C2: { showTotals: true, isAscSortOrder: false },
              C3: { showTotals: false, isAscSortOrder: false },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return pivoted and pivoted (grand)totals rows in correct order", () => {
            // C1, C2, 'i'(CN1, CN2), 'h'(CN1, CN2), 'g'(CN1, CN2)
            const expectedRows = [
              ["c", "e", -1, 9, 1, 9, null, null],
              setTotalIndex(["c", null, -1, 9, 1, 9, null, null], 1),
              ["b", "d", null, null, 1, -12, null, null],
              setTotalIndex(["b", null, null, null, 1, -12, null, null], 1),
              ["a", "e", null, null, 4, 7, null, null],
              ["a", "d", null, null, null, null, 3, 5],
              setTotalIndex(["a", null, null, null, 4, 7, 3, 5], 1),
              setTotalIndex([null, null, -1, 9, 6, 4, 3, 5], 0),
            ];

            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: desc C1, desc C2 columnSource: desc C3 and valuesSources CN2, " +
          "where we select 'show totals' for 'C1' and 'C2",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2"],
            columnsSource: ["C3"],
            valuesSources: ["CN2"],
            columnNameToMetadata: {
              C1: { showTotals: true, isAscSortOrder: false },
              C2: { showTotals: true, isAscSortOrder: false },
              C3: { showTotals: false, isAscSortOrder: false },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return pivoted and pivoted (grand)totals rows in correct order", () => {
            // C1, C2, 'i'(CN1), 'h'(CN1), 'g'(CN1)
            const expectedRows = [
              ["c", "e", 9, 9, null],
              setTotalIndex(["c", null, 9, 9, null], 1),
              ["b", "d", null, -12, null],
              setTotalIndex(["b", null, null, -12, null], 1),
              ["a", "e", null, 7, null],
              ["a", "d", null, null, 5],
              setTotalIndex(["a", null, null, 7, 5], 1),
              setTotalIndex([null, null, 9, 4, 5], 0),
            ];

            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );

      describe(
        "given rawOrderedDatasetData and settings with groupsSources: desc C1, desc C2 columnSource: desc C3 and valuesSources CN2, " +
          "where we select 'show totals' for 'C1' and 'C2 and 'C3'",
        () => {
          const settings = toSettings({
            groupsSources: ["C1", "C2"],
            columnsSource: ["C3"],
            valuesSources: ["CN2"],
            columnNameToMetadata: {
              C1: { showTotals: true, isAscSortOrder: false },
              C2: { showTotals: true, isAscSortOrder: false },
              C3: { showTotals: true, isAscSortOrder: false },
            },
          });

          const { rows } = buildDatasetData(
            settings,
            rawOrderedDatasetData,
            resultsProvider,
          );
          it("builder should return pivoted and pivoted (grand)totals rows in correct order", () => {
            // C1, C2, 'i'(CN1), 'h'(CN1), 'g'(CN1)
            const expectedRows = [
              ["c", "e", 9, 9, null, 18],
              setTotalIndex(["c", null, 9, 9, null, 18], 1),
              ["b", "d", null, -12, null, -12],
              setTotalIndex(["b", null, null, -12, null, -12], 1),
              ["a", "e", null, 7, null, 7],
              ["a", "d", null, null, 5, 5],
              setTotalIndex(["a", null, null, 7, 5, 12], 1),
              setTotalIndex([null, null, 9, 4, 5, 18], 0),
            ];

            dataRowListsAreEqual(rows, expectedRows);
          });
        },
      );
    });
  });
  //
  //   describe("given rows in correct order", () => {
  //     const data = makeData([
  //       ["a", "x", 1],
  //       ["a", "y", 2],
  //       ["a", "z", 3],
  //       ["b", "z", 4],
  //       ["b", "x", 5],
  //       ["b", "y", 6],
  //     ]);
  //     const gm = newSimpleGroupingManager(data.rows);
  //     it("should return rows in the the same order", () => {
  //       expect(gm.rowsOrdered).toEqual(data.rows);
  //     });
  //
  //     const hiddenCells = [1, 2, 4, 5];
  //     hiddenCells.forEach(rn => it("should hide row: " + rn, () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(false)));
  //
  //     const visibleCells = [0, 3];
  //     visibleCells.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(true)));
  //   });
  //
  //   describe("given rows in correct order and columns for grouping (1)", () => {
  //     const columnsIndexesForGrouping = [0, 1];
  //     const data = makeData([
  //       ["a", "x", 0],
  //       ["a", "x", 1],
  //       ["a", "z", 2],
  //       ["b", "x", 3],
  //       ["b", "x", 4],
  //       ["b", "z", 5],
  //
  //     ]);
  //     const gm = newGroupingManager(columnsIndexesForGrouping, data.rows);
  //     it("should return rows in the the same order", () => {
  //       expect(gm.rowsOrdered).toEqual(data.rows);
  //     });
  //
  //     const hiddenCells0 = [1, 2, 4, 5];
  //     hiddenCells0.forEach(rn => it("should hide row: " + rn, () => expect(gm.isVisible(rn, 0,  rowVisibleRangeMock)).toEqual(false)));
  //
  //     const visibleRows0 = [0, 3];
  //     visibleRows0.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(true)));
  //
  //     const hiddenCells1 = [1,4];
  //     hiddenCells1.forEach(rn => it("should hide row: " + rn, () => expect(gm.isVisible(rn, 1,  rowVisibleRangeMock)).toEqual(false)));
  //
  //     const visibleRows1 = [0,2, 3, 5];
  //     visibleRows1.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 1, rowVisibleRangeMock)).toEqual(true)));
  //
  //
  //     it("should have correct row height", () => {
  //       expect(gm.mapStyle(0, 0, rowVisibleRangeMock, styleMock).height).toEqual(3);
  //       expect(gm.mapStyle(3, 1, rowVisibleRangeMock, styleMock).height).toEqual(2);
  //       expect(gm.mapStyle(5, 1, rowVisibleRangeMock, styleMock).height).toEqual(1);
  //     });
  //
  //   });
  //
  //   describe("given rows in correct order and columns for grouping (3)", () => {
  //     const columnsIndexesForGrouping = [0, 1];
  //     const data = makeData([
  //       ["a", "x", 0],
  //       ["b", "x", 1],
  //       ["c", "z", 2],
  //       ["d", "x", 3],
  //       ["e", "x", 4],
  //       ["f", "z", 5],
  //
  //     ]);
  //     const gm = newGroupingManager(columnsIndexesForGrouping, data.rows);
  //     it("should return rows in the the same order", () => {
  //       expect(gm.rowsOrdered).toEqual(data.rows);
  //     });
  //
  //     const visibleRows0 = [0, 1, 2, 3, 4, 5];
  //     visibleRows0.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(true)));
  //
  //
  //     const visibleRows1 = [0, 1, 2, 3, 4, 5];
  //     visibleRows1.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 1, rowVisibleRangeMock)).toEqual(true)));
  //
  //
  //     const rows = [0, 1, 2, 3, 4, 5];
  //     rows.forEach(rowIndex =>
  //     it("should have correct row height", () => {
  //       expect(gm.mapStyle(rowIndex, 0, rowVisibleRangeMock, styleMock).height).toEqual(1);
  //       expect(gm.mapStyle(rowIndex, 1, rowVisibleRangeMock, styleMock).height).toEqual(1);
  //     }));
  //
  //   });
  //     describe("given rows in correct order and columns for grouping (2)", () => {
  //     const columnsIndexesForGrouping2 = [1, 0];
  //     const data2 = makeData([
  //       ["a", "x", 0],
  //       ["a", "x", 1],
  //       ["b", "x", 2],
  //       ["b", "x", 3],
  //       ["a", "z", 4],
  //       ["b", "z", 5],
  //     ]);
  //     const gm = newGroupingManager(columnsIndexesForGrouping2, data2.rows);
  //     it("should return rows in the the same order", () => {
  //       expect(gm.rowsOrdered).toEqual(data2.rows);
  //     });
  //
  //     const hiddenCells1 = [1, 2, 3, 5];
  //     hiddenCells1.forEach(rn => it("should hide row: " + rn, () => expect(gm.isVisible(rn, 1,  rowVisibleRangeMock)).toEqual(false)));
  //
  //     const visibleRows1 = [0, 4];
  //     visibleRows1.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 1, rowVisibleRangeMock)).toEqual(true)));
  //
  //       const hiddenCells0 = [1, 3];
  //       hiddenCells0.forEach(rn => it("should hide row: " + rn, () => expect(gm.isVisible(rn, 0,  rowVisibleRangeMock)).toEqual(false)));
  //
  //       const visibleRows0 = [0, 2,4,5];
  //       visibleRows0.forEach(rn => it("should display row: " + rn, () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(true)));
  //
  //
  //       it("should have correct row height", () => {
  //         expect(gm.mapStyle(0, 1, rowVisibleRangeMock, styleMock).height).toEqual(4);
  //         expect(gm.mapStyle(2, 0, rowVisibleRangeMock, styleMock).height).toEqual(2);
  //         expect(gm.mapStyle(4, 0, rowVisibleRangeMock, styleMock).height).toEqual(1);
  //         expect(gm.mapStyle(4, 1, rowVisibleRangeMock, styleMock).height).toEqual(2);
  //       });
  //   });
  //
  //   describe("given rows in incorrect order", () => {
  //     const data = makeData([
  //       ["a", "x", 1],
  //       ["c", "z", 4],
  //       ["b", "x", 5],
  //       ["a", "y", 2],
  //       ["a", "z", 3],
  //       ["b", "y", 6],
  //     ]);
  //     const expectedData = makeData([
  //       ["a", "x", 1],
  //       ["a", "y", 2],
  //       ["a", "z", 3],
  //       ["c", "z", 4],
  //       ["b", "x", 5],
  //       ["b", "y", 6],
  //     ]);
  //     const gm = newSimpleGroupingManager(data.rows);
  //     it("should return rows in group order", () => {
  //       expect(gm.rowsOrdered).toEqual(expectedData.rows);
  //     });
  //
  //     const hiddenRows = [1, 2, 5];
  //     hiddenRows.forEach(rn => it("should display cell: " + rn + ",0", () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(false)));
  //
  //     const visibleRows = [0, 3, 4];
  //     visibleRows.forEach(rn => it("should hide cell: " + rn + ",0", () => expect(gm.isVisible(rn, 0, rowVisibleRangeMock)).toEqual(true)));
  //
  //     it("should have correct row height", () => {
  //       expect(gm.mapStyle(0, 0, rowVisibleRangeMock, styleMock).height).toEqual(3);
  //       expect(gm.mapStyle(3, 0, rowVisibleRangeMock, styleMock).height).toEqual(1);
  //       expect(gm.mapStyle(4, 0, rowVisibleRangeMock, styleMock).height).toEqual(2);
  //     });
  //   });
  //
  //
  //   describe("given rows in incorrect order and columns for grouping", () => {
  //     const columnsIndexesForGrouping1 = [1, 0];
  //     const data = makeData([
  //       ["a", "x", 1],
  //       ["a", "z", 3],
  //       ["c", "z", 4],
  //       ["b", "x", 2],
  //       ["a", "y", 5],
  //       ["b", "y", 6],
  //     ]);
  //     const expectedData = makeData([
  //       ["a", "x", 1],
  //       ["b", "x", 2],
  //       ["a", "z", 3],
  //       ["c", "z", 4],
  //       ["a", "y", 5],
  //       ["b", "y", 6],
  //     ]);
  //     const gm = newGroupingManager(columnsIndexesForGrouping1, data.rows);
  //     it("should return rows in group order", () => {
  //       expect(gm.rowsOrdered).toEqual(expectedData.rows);
  //     }); });
  //
  //   describe("given range of visible rows with lower boundary", () => {
  //     const index3 = 3;
  //     const index6 = 6;
  //     const rowVisibleRange = {start: index3, stop: 100};
  //
  //     const data = makeData([
  //       ["a", "x", 0],
  //       ["a", "z", 1],
  //       ["a", "x", 2],
  //       ["a", "y", index3],
  //       ["a", "z", 4],
  //       ["a", "y", 5],
  //       ["b", "z", index6],
  //       ["b", "x", 7],
  //       ["b", "y", 8],
  //       ["b", "z", 9],
  //       ["b", "y", 10],
  //     ]);
  //
  //     const gm = newSimpleGroupingManager(data.rows);
  //     it("should return rows in the the same order", () =>
  //       expect(gm.rowsOrdered).toEqual(data.rows)
  //     );
  //
  //     const hiddenRows = [0, 1, 2, 4, 5, 7, 8, 9, 10];
  //
  //     hiddenRows.forEach(rn =>
  //       it("should hide row: " + rn, () => expect(gm.isVisible(rn, 0, rowVisibleRange)).toEqual(false)));
  //
  //     const visibleRows = [index3, index6];
  //     visibleRows.forEach(rn => it("should display row: " + rn, () =>
  //       expect(gm.isVisible(rn, 0, rowVisibleRange)).toEqual(true))
  //     );
  //
  //
  //     it(`row number ${index3} should has correct height and top `, () => {
  //       const top = 3;
  //       const style = gm.mapStyle(index3, 0, rowVisibleRange, newStyleWithTop(top));
  //       expect(style.height).toEqual(3);
  //       expect(style.top).toEqual(top);
  //     });
  //
  //     it(`row number ${index6} should has correct height and top `, () => {
  //       const top = 6;
  //       const style = gm.mapStyle(index6, 0, rowVisibleRange, newStyleWithTop(top));
  //       expect(style.height).toEqual(5);
  //       expect(style.top).toEqual(top);
  //     });
  //   });
});
