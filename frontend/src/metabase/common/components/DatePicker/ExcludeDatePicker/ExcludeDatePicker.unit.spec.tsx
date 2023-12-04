import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import {
  DATE_PICKER_OPERATORS,
  DATE_PICKER_EXTRACTION_UNITS,
} from "../constants";
import type { DatePickerOperator, DatePickerExtractionUnit } from "../types";
import { ExcludeDatePicker } from "./ExcludeDatePicker";

interface SetupOpts {
  availableOperators?: ReadonlyArray<DatePickerOperator>;
  availableUnits?: ReadonlyArray<DatePickerExtractionUnit>;
  isNew?: boolean;
}

function setup({
  availableOperators = DATE_PICKER_OPERATORS,
  availableUnits = DATE_PICKER_EXTRACTION_UNITS,
  isNew = false,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <ExcludeDatePicker
      availableOperators={availableOperators}
      availableUnits={availableUnits}
      isNew={isNew}
      onChange={onChange}
      onBack={onBack}
    />,
  );

  return { onChange, onBack };
}

describe("ExcludeDatePicker", () => {
  it("should allow to exclude days", () => {
    const { onChange } = setup({ isNew: true });

    userEvent.click(screen.getByText("Days of the week…"));
    userEvent.click(screen.getByText("Monday"));
    userEvent.click(screen.getByText("Sunday"));
    userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      unit: "day-of-week",
      values: [1, 7],
    });
  });

  it("should allow to exclude months", () => {
    const { onChange } = setup({ isNew: true });

    userEvent.click(screen.getByText("Months of the year…"));
    userEvent.click(screen.getByText("January"));
    userEvent.click(screen.getByText("December"));
    userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      unit: "month-of-year",
      values: [0, 11],
    });
  });

  it("should allow to exclude quarters", () => {
    const { onChange } = setup({ isNew: true });

    userEvent.click(screen.getByText("Quarters of the year…"));
    userEvent.click(screen.getByText("1st"));
    userEvent.click(screen.getByText("4th"));
    userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      unit: "quarter-of-year",
      values: [1, 4],
    });
  });

  it("should allow to exclude hours", () => {
    const { onChange } = setup({ isNew: true });

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

  it("should allow to exclude empty values", () => {
    const { onChange } = setup();

    userEvent.click(screen.getByText("Is empty"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "not-null",
      values: [],
    });
  });

  it("should allow to exclude not empty values", () => {
    const { onChange } = setup();

    userEvent.click(screen.getByText("Is not empty"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "is-null",
      values: [],
    });
  });
});
