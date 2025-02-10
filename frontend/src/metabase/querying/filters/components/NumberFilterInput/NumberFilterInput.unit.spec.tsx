import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";
import { createMockField } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { NumberFilterInput } from "./NumberFilterInput";

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

type SetupOpts = {
  value?: Lib.NumberFilterValue | "";
  column: Lib.ColumnMetadata;
};

function setup({ value = "", column }: SetupOpts) {
  const onChange = jest.fn();
  renderWithProviders(
    <NumberFilterInput value={value} column={column} onChange={onChange} />,
  );

  const input = screen.getByRole("textbox");
  return { input, onChange };
}

describe("NumberFilterInput", () => {
  const query = createQuery({ metadata: TEST_METADATA });
  const columns = Lib.filterableColumns(query, -1);
  const findColumn = columnFinder(query, columns);
  const integerColumn = findColumn("ORDERS", "INTEGER");
  const floatColumn = findColumn("ORDERS", "FLOAT");
  const bigIntegerColumn = findColumn("ORDERS", "BIGINTEGER");
  const bigDecimalColumn = findColumn("ORDERS", "DECIMAL");

  it("should allow to enter a value for a integer column", async () => {
    const { input, onChange } = setup({ column: integerColumn });
    await userEvent.type(input, "10");
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("should allow to enter a value for a float column", async () => {
    const { input, onChange } = setup({ column: floatColumn });
    await userEvent.type(input, "10.1");
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenCalledWith(10.1);
  });

  it("should allow to enter a value for a big integer column", async () => {
    const { input, onChange } = setup({ column: bigIntegerColumn });
    await userEvent.type(input, "9007199254740993");
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenCalledWith("9007199254740993");
  });

  it("should allow to enter a value for a big decimal column", async () => {
    const { input, onChange } = setup({ column: bigDecimalColumn });
    await userEvent.type(input, "10.1");
    await userEvent.click(document.body);
    expect(onChange).toHaveBeenCalledWith("10.1");
  });
});
