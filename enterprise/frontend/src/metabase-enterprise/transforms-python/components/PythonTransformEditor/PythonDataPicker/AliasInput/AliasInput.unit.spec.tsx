import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockTable } from "metabase-types/api/mocks";

import type { TableSelection } from "../types";

import { AliasInput } from "./AliasInput";

const TABLE = createMockTable();

const SELECTION: TableSelection = {
  tableId: 1,
  alias: "test_table",
};

function setup() {
  const onChange = jest.fn();

  renderWithProviders(
    <AliasInput
      selection={SELECTION}
      table={TABLE}
      usedAliases={new Set([SELECTION.alias])}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("AliasInput", () => {
  it("should not call onChange when blurred without changes (GDGT-1570)", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByDisplayValue("test_table"));
    await userEvent.tab();

    expect(onChange).not.toHaveBeenCalled();
  });

  it("should call onChange with the new value when blurred after a change", async () => {
    const { onChange } = setup();

    await userEvent.type(screen.getByDisplayValue("test_table"), "x");
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("test_tablex");
  });

  it("should not call onChange when a change is reverted before blurring (GDGT-1570)", async () => {
    const { onChange } = setup();

    const input = screen.getByDisplayValue("test_table");
    await userEvent.type(input, "x");
    await userEvent.type(input, "{backspace}");
    await userEvent.tab();

    expect(onChange).not.toHaveBeenCalled();
  });
});
