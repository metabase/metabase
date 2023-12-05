import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, within } from "__support__/ui";
import { DATE_PICKER_OPERATORS } from "../constants";
import type { DatePickerOperator, SpecificDatePickerValue } from "../types";
import { SpecificDatePicker } from "./SpecificDatePicker";

interface SetupOpts {
  value?: SpecificDatePickerValue;
  availableOperators?: ReadonlyArray<DatePickerOperator>;
  isNew?: boolean;
}

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

  it('should be able to set "on" filter', () => {
    const { onChange } = setup({ isNew: true });

    userEvent.click(screen.getByText("On"));
    userEvent.click(screen.getByText("15"));
    userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "specific",
      operator: "=",
      values: [new Date(2020, 0, 15)],
    });
  });

  it('should be able to set "before" filter', () => {
    const { onChange } = setup({ isNew: true });

    userEvent.click(screen.getByText("Before"));
    userEvent.click(screen.getByText("15"));
    userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "specific",
      operator: "<",
      values: [new Date(2020, 0, 15)],
    });
  });

  it('should be able to set "after" filter', () => {
    const { onChange } = setup({ isNew: true });

    userEvent.click(screen.getByText("After"));
    userEvent.clear(screen.getByLabelText("Date"));
    userEvent.type(screen.getByLabelText("Date"), "Feb 15, 2020");
    userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "specific",
      operator: ">",
      values: [new Date(2020, 1, 15)],
    });
  });

  it('should be able to set "between" filter', () => {
    const { onChange } = setup({ isNew: true });

    const calendars = screen.getAllByRole("table");
    userEvent.click(within(calendars[0]).getByText("12"));
    userEvent.click(within(calendars[1]).getByText("5"));
    userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenLastCalledWith({
      type: "specific",
      operator: "between",
      values: [new Date(2019, 11, 12), new Date(2020, 0, 5)],
    });
  });

  it('should swap values for "between" filter when min > max', () => {
    const { onChange } = setup({ isNew: true });

    const startDateInput = screen.getByLabelText("Start date");
    userEvent.clear(startDateInput);
    userEvent.type(startDateInput, "Feb 15, 2020");

    const endDateInput = screen.getByLabelText("End date");
    userEvent.clear(endDateInput);
    userEvent.type(endDateInput, "Dec 29, 2019");
    userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenLastCalledWith({
      type: "specific",
      operator: "between",
      values: [new Date(2019, 11, 29), new Date(2020, 1, 15)],
    });
  });
});
