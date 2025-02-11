import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { columnFinder, createQuery } from "metabase-lib/test-helpers";

import { NumberFilterInput } from "./NumberFilterInput";

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
  const query = createQuery();
  const columns = Lib.filterableColumns(query, -1);
  const findColumn = columnFinder(query, columns);
  const integerColumn = findColumn("ORDERS", "QUANTITY");
  const floatColumn = findColumn("ORDERS", "TOTAL");
  const bigIntegerColumn = findColumn("ORDERS", "ID");

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
    expect(onChange).toHaveBeenCalledWith(9007199254740993n);
  });
});
