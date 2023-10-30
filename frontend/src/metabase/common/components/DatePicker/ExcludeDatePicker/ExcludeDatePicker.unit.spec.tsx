import userEvent from "@testing-library/user-event";
import { render, screen } from "__support__/ui";
import {
  DATE_PICKER_OPERATORS,
  DATE_PICKER_EXTRACTION_UNITS,
} from "../constants";
import type { DatePickerOperator, DatePickerExtractionUnit } from "../types";
import { ExcludeDatePicker } from "./ExcludeDatePicker";

interface SetupOpts {
  availableOperators?: ReadonlyArray<DatePickerOperator>;
  availableUnits?: ReadonlyArray<DatePickerExtractionUnit>;
}

function setup({
  availableOperators = DATE_PICKER_OPERATORS,
  availableUnits = DATE_PICKER_EXTRACTION_UNITS,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  render(
    <ExcludeDatePicker
      availableOperators={availableOperators}
      availableUnits={availableUnits}
      onChange={onChange}
      onBack={onBack}
    />,
  );

  return { onChange, onBack };
}

describe("ExcludeDatePicker", () => {
  it("should allow to set an hour filter", () => {
    const { onChange } = setup();

    userEvent.click(screen.getByText("Hours of the day…"));
    userEvent.click(screen.getByText("12 AM"));
    userEvent.click(screen.getByText("2 AM"));
    userEvent.click(screen.getByText("5 PM"));
    userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      unit: "hour-of-day",
      values: [0, 2, 17],
    });
  });
});
