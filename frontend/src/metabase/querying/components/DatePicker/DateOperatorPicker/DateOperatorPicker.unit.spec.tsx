import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { DATE_PICKER_OPERATORS } from "../constants";
import type { DatePickerValue, DatePickerOperator } from "../types";

import { DateOperatorPicker } from "./DateOperatorPicker";

interface SetupOpts {
  value?: DatePickerValue;
  availableOperators?: ReadonlyArray<DatePickerOperator>;
}

function setup({
  value,
  availableOperators = DATE_PICKER_OPERATORS,
}: SetupOpts = {}) {
  const onChange = jest.fn();

  renderWithProviders(
    <DateOperatorPicker
      value={value}
      availableOperators={availableOperators}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("DateOperatorPicker", () => {
  it("should be able to change the option type", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByDisplayValue("All time"));
    await userEvent.click(screen.getByText("Current"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: "current",
      unit: "day",
    });
  });
});
