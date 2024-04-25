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
  it("should allow to exclude days", async () => {
    const { onChange } = setup({ isNew: true });

    await userEvent.click(screen.getByText("Days of the week…"));
    await userEvent.click(screen.getByText("Monday"));
    await userEvent.click(screen.getByText("Sunday"));
    await userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      unit: "day-of-week",
      values: [1, 7],
    });
  });

  it("should allow to exclude months", async () => {
    const { onChange } = setup({ isNew: true });

    await userEvent.click(screen.getByText("Months of the year…"));
    await userEvent.click(screen.getByText("January"));
    await userEvent.click(screen.getByText("December"));
    await userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      unit: "month-of-year",
      values: [0, 11],
    });
  });

  it("should allow to exclude quarters", async () => {
    const { onChange } = setup({ isNew: true });

    await userEvent.click(screen.getByText("Quarters of the year…"));
    await userEvent.click(screen.getByText("1st"));
    await userEvent.click(screen.getByText("4th"));
    await userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      unit: "quarter-of-year",
      values: [1, 4],
    });
  });

  it("should allow to exclude hours", async () => {
    const { onChange } = setup({ isNew: true });

    await userEvent.click(screen.getByText("Hours of the day…"));
    await userEvent.click(screen.getByText("12 AM"));
    await userEvent.click(screen.getByText("2 AM"));
    await userEvent.click(screen.getByText("5 PM"));
    await userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      unit: "hour-of-day",
      values: [0, 2, 17],
    });
  });

  it("should allow to exclude empty values", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByText("Is empty"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "not-null",
      values: [],
    });
  });

  it("should allow to exclude not empty values", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByText("Is not empty"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "is-null",
      values: [],
    });
  });
});
