import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { createMockField } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { parseNumberForColumn } from "./numbers";

type NumberForColumnTestCase = {
  value: string;
  numberColumns: Lib.ColumnMetadata[];
  stringColumns: Lib.ColumnMetadata[];
};

const TEST_METADATA = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable({
          fields: [
            createMockField({
              id: 1,
              table_id: ORDERS_ID,
              name: "INTEGER",
              display_name: "Integer",
              base_type: "type/Integer",
              effective_type: "type/Integer",
            }),
            createMockField({
              id: 2,
              table_id: ORDERS_ID,
              name: "FLOAT",
              display_name: "Float",
              base_type: "type/Float",
              effective_type: "type/Float",
            }),
            createMockField({
              id: 3,
              table_id: ORDERS_ID,
              name: "BIGINTEGER",
              display_name: "BigInteger",
              base_type: "type/BigInteger",
              effective_type: "type/BigInteger",
            }),
            createMockField({
              id: 4,
              table_id: ORDERS_ID,
              name: "DECIMAL",
              display_name: "Decimal",
              base_type: "type/Decimal",
              effective_type: "type/Decimal",
            }),
          ],
        }),
      ],
    }),
  ],
});

describe("parseNumberForColumn", () => {
  const query = createQuery({ metadata: TEST_METADATA });
  const columns = Lib.filterableColumns(query, -1);
  const findColumn = columnFinder(query, columns);
  const integerColumn = findColumn("ORDERS", "INTEGER");
  const floatColumn = findColumn("ORDERS", "FLOAT");
  const bigIntegerColumn = findColumn("ORDERS", "BIGINTEGER");
  const bigDecimalColumn = findColumn("ORDERS", "DECIMAL");

  it.each<NumberForColumnTestCase>([
    {
      value: "10",
      numberColumns: [
        integerColumn,
        floatColumn,
        bigIntegerColumn,
        bigDecimalColumn,
      ],
      stringColumns: [],
    },
    {
      value: "-10",
      numberColumns: [
        integerColumn,
        floatColumn,
        bigIntegerColumn,
        bigDecimalColumn,
      ],
      stringColumns: [],
    },
    {
      value: Number.MAX_SAFE_INTEGER.toString(),
      numberColumns: [
        integerColumn,
        floatColumn,
        bigIntegerColumn,
        bigDecimalColumn,
      ],
      stringColumns: [],
    },
    {
      value: Number.MIN_SAFE_INTEGER.toString(),
      numberColumns: [
        integerColumn,
        floatColumn,
        bigIntegerColumn,
        bigDecimalColumn,
      ],
      stringColumns: [],
    },
    {
      value: "9007199254740993",
      numberColumns: [integerColumn, floatColumn],
      stringColumns: [bigIntegerColumn, bigDecimalColumn],
    },
    {
      value: "10.1",
      numberColumns: [integerColumn, floatColumn, bigIntegerColumn],
      stringColumns: [bigDecimalColumn],
    },
    {
      value: "-10.1",
      numberColumns: [integerColumn, floatColumn, bigIntegerColumn],
      stringColumns: [bigDecimalColumn],
    },
    {
      value: "9007199254740993.1",
      numberColumns: [integerColumn, floatColumn, bigIntegerColumn],
      stringColumns: [bigDecimalColumn],
    },
  ])(
    'should parse value "$value" based on the column effective type',
    ({ value, numberColumns, stringColumns }) => {
      numberColumns.forEach(column => {
        expect(parseNumberForColumn(value, column)).toBe(Number(value));
      });
      stringColumns.forEach(column => {
        expect(parseNumberForColumn(value, column)).toBe(value);
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
