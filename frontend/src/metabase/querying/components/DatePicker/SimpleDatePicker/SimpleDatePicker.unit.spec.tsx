import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { DATE_PICKER_OPERATORS } from "../constants";
import type { DatePickerOperator, DatePickerValue } from "../types";
import { SimpleDatePicker } from "./SimpleDatePicker";

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
    <SimpleDatePicker
      value={value}
      availableOperators={availableOperators}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("SimpleDatePicker", () => {
  it("should be able change and submit the value", () => {
    const { onChange } = setup();

    userEvent.click(screen.getByDisplayValue("All time"));
    userEvent.click(screen.getByText("Current"));
    userEvent.click(screen.getByDisplayValue("Day"));
    userEvent.click(screen.getByText("Month"));
    userEvent.click(screen.getByText("Apply"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: "current",
      unit: "month",
    });
  });
});
