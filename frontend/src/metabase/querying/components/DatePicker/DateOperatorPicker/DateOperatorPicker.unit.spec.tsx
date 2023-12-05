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
  it("should be able to change the option type", () => {
    const { onChange } = setup();

    userEvent.click(screen.getByDisplayValue("All time"));
    userEvent.click(screen.getByText("Current"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: "current",
      unit: "day",
    });
  });

  it("should be able to change a specific date value", () => {
    const { onChange } = setup({
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2015, 1, 10)],
      },
    });

    userEvent.click(screen.getByText("15"));

    expect(onChange).toHaveBeenCalledWith({
      type: "specific",
      operator: "=",
      values: [new Date(2015, 1, 15)],
    });
  });

  it("should be able to change a relative date value", () => {
    const { onChange } = setup({
      value: {
        type: "relative",
        value: 1,
        unit: "month",
      },
    });

    userEvent.type(screen.getByLabelText("Interval"), "2");

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: 12,
      unit: "month",
    });
  });
});
