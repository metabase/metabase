import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";

import { parseNumberForColumn } from "./numbers";

describe("parseNumberForColumn", () => {
  const query = createQuery();
  const columns = Lib.filterableColumns(query, -1);
  const findColumn = columnFinder(query, columns);
  const integerColumn = findColumn("ORDERS", "QUANTITY");
  const floatColumn = findColumn("ORDERS", "TOTAL");
  const bigIntegerColumn = findColumn("ORDERS", "ID");

  it.each([
    {
      value: "10",
      columns: [integerColumn, floatColumn, bigIntegerColumn],
      expectedValue: 10,
    },
    {
      value: "9007199254740993",
      columns: [integerColumn, floatColumn],
      expectedValue: Number("9007199254740992"),
    },
    {
      value: "9007199254740993",
      columns: [bigIntegerColumn],
      expectedValue: 9007199254740993n,
    },
    {
      value: "10.1",
      columns: [integerColumn, floatColumn, bigIntegerColumn],
      expectedValue: 10.1,
    },
    {
      value: "9007199254740993.1",
      columns: [integerColumn, bigIntegerColumn],
      expectedValue: Number("9007199254740994"),
    },
  ])(
    "should parse a numeric string based on the column type",
    ({ value, columns, expectedValue }) => {
      columns.forEach(column => {
        expect(parseNumberForColumn(value, column)).toBe(expectedValue);
      });
    },
  );

  it.each(["", " ", "Infinity", "-Infinity", "NaN"])(
    "should ignore invalid input",
    value => {
      columns.forEach(column => {
        expect(parseNumberForColumn(value, column)).toBeNull();
      });
    },
  );
});
