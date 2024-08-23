import _userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";

import { DATE_PICKER_OPERATORS } from "../constants";
import type { DatePickerOperator, SpecificDatePickerValue } from "../types";

import { SpecificDatePicker } from "./SpecificDatePicker";

interface SetupOpts {
  value?: SpecificDatePickerValue;
  availableOperators?: ReadonlyArray<DatePickerOperator>;
  isNew?: boolean;
}

const userEvent = _userEvent.setup({
  advanceTimers: jest.advanceTimersByTime,
});

function setup({
  value,
  availableOperators = DATE_PICKER_OPERATORS,
  isNew = false,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <SpecificDatePicker
      value={value}
      availableOperators={availableOperators}
      isNew={isNew}
      onChange={onChange}
      onBack={onBack}
    />,
  );

  return { onChange, onBack };
}

describe("SpecificDatePicker", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  it('should be able to set "on" filter', async () => {
    const { onChange } = setup({ isNew: true });

    await userEvent.click(screen.getByText("On"));
    await userEvent.click(screen.getByText("15"));
    await userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "specific",
      operator: "=",
      values: [new Date(2020, 0, 15)],
      hasTime: false,
    });
  });

  it('should be able to set "before" filter', async () => {
    const { onChange } = setup({ isNew: true });

    await userEvent.click(screen.getByText("Before"));
    await userEvent.click(screen.getByText("15"));
    await userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "specific",
      operator: "<",
      values: [new Date(2020, 0, 15)],
      hasTime: false,
    });
  });

  it('should be able to set "after" filter', async () => {
    const { onChange } = setup({ isNew: true });

    await userEvent.click(screen.getByText("After"));
    await userEvent.clear(screen.getByLabelText("Date"));
    await userEvent.type(screen.getByLabelText("Date"), "Feb 15, 2020");
    await userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "specific",
      operator: ">",
      values: [new Date(2020, 1, 15)],
      hasTime: false,
    });
  });

  it('should be able to set "between" filter', async () => {
    const { onChange } = setup({ isNew: true });

    const calendars = screen.getAllByRole("table");
    await userEvent.click(within(calendars[0]).getByText("12"));
    await userEvent.click(within(calendars[1]).getByText("5"));
    await userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenLastCalledWith({
      type: "specific",
      operator: "between",
      values: [new Date(2019, 11, 12), new Date(2020, 0, 5)],
      hasTime: false,
    });
  });

  it('should swap values for "between" filter when min > max', async () => {
    const { onChange } = setup({ isNew: true });

    const startDateInput = screen.getByLabelText("Start date");
    await userEvent.clear(startDateInput);
    await userEvent.type(startDateInput, "Feb 15, 2020");

    const endDateInput = screen.getByLabelText("End date");
    await userEvent.clear(endDateInput);
    await userEvent.type(endDateInput, "Dec 29, 2019");
    await userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenLastCalledWith({
      type: "specific",
      operator: "between",
      values: [new Date(2019, 11, 29), new Date(2020, 1, 15)],
      hasTime: false,
    });
  });
});
