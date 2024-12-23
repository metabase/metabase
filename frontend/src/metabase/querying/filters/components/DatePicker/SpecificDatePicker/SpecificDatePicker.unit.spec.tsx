import _userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import {
  DATE_PICKER_OPERATORS,
  DATE_PICKER_UNITS,
} from "metabase/querying/filters/constants";
import type {
  DatePickerOperator,
  DatePickerUnit,
  SpecificDatePickerValue,
} from "metabase/querying/filters/types";

import { SpecificDatePicker } from "./SpecificDatePicker";

interface SetupOpts {
  value?: SpecificDatePickerValue;
  availableOperators?: DatePickerOperator[];
  availableUnits?: DatePickerUnit[];
  isNew?: boolean;
}

const userEvent = _userEvent.setup({
  advanceTimers: jest.advanceTimersByTime,
});

function setup({
  value,
  availableOperators = DATE_PICKER_OPERATORS,
  availableUnits = DATE_PICKER_UNITS,
  isNew = false,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <SpecificDatePicker
      value={value}
      availableOperators={availableOperators}
      availableUnits={availableUnits}
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

  it("should not allow to add time when time units are not supported", async () => {
    setup({ availableUnits: ["day", "month"] });
    await userEvent.click(screen.getByText("On"));
    expect(screen.queryByText("Add time")).not.toBeInTheDocument();
  });

  it("should allow to remove time even when time units are not supported", async () => {
    const { onChange } = setup({
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2020, 0, 1, 10, 20)],
        hasTime: true,
      },
      availableUnits: ["day", "month"],
    });

    await userEvent.click(screen.getByText("Remove time"));
    await userEvent.click(screen.getByText("Update filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "specific",
      operator: "=",
      values: [new Date(2020, 0, 1)],
      hasTime: false,
    });
    expect(screen.queryByText("Add time")).not.toBeInTheDocument();
  });
});
