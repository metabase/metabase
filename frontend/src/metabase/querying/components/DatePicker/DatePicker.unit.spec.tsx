import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import type { DatePickerValue } from "./types";
import { DatePicker } from "./DatePicker";

interface SetupOpts {
  value?: DatePickerValue;
  isNew?: boolean;
  canUseRelativeOffsets?: boolean;
}

function setup({
  value,
  isNew = false,
  canUseRelativeOffsets = false,
}: SetupOpts = {}) {
  const onChange = jest.fn();

  renderWithProviders(
    <DatePicker
      value={value}
      isNew={isNew}
      canUseRelativeOffsets={canUseRelativeOffsets}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("DatePicker", () => {
  it("should add a filter via shortcut", () => {
    const { onChange } = setup({ isNew: true });

    userEvent.click(screen.getByText("Today"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: "current",
      unit: "day",
    });
  });

  it("should add a specific date filter", () => {
    const { onChange } = setup({ isNew: true });

    userEvent.click(screen.getByText("Specific dates…"));
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

  it("should update a specific date filter", () => {
    const { onChange } = setup({
      value: {
        type: "specific",
        operator: ">",
        values: [new Date(2020, 1, 15)],
      },
    });

    userEvent.click(screen.getByText("20"));
    userEvent.click(screen.getByText("Update filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "specific",
      operator: ">",
      values: [new Date(2020, 1, 20)],
    });
  });

  it("should add a relative date filter", () => {
    const { onChange } = setup({ isNew: true });

    userEvent.click(screen.getByText("Relative dates…"));
    userEvent.clear(screen.getByLabelText("Interval"));
    userEvent.type(screen.getByLabelText("Interval"), "20");
    userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: -20,
      unit: "day",
      offsetValue: undefined,
      offsetUnit: undefined,
    });
  });

  it("should update a relative date filter", () => {
    const { onChange } = setup({
      value: {
        type: "relative",
        value: -20,
        unit: "day",
        offsetValue: undefined,
        offsetUnit: undefined,
      },
    });

    userEvent.click(screen.getByText("Next"));
    userEvent.click(screen.getByText("Update filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: 20,
      unit: "day",
      offsetValue: undefined,
      offsetUnit: undefined,
    });
  });

  it("should add an exclude date filter", () => {
    const { onChange } = setup({ isNew: true });

    userEvent.click(screen.getByText("Exclude…"));
    userEvent.click(screen.getByText("Days of the week…"));
    userEvent.click(screen.getByText("Monday"));
    userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      values: [1],
      unit: "day-of-week",
    });
  });

  it("should update an exclude date filter", () => {
    const { onChange } = setup({
      value: {
        type: "exclude",
        operator: "!=",
        values: [1],
        unit: "day-of-week",
      },
    });

    userEvent.click(screen.getByText("Monday"));
    userEvent.click(screen.getByText("Wednesday"));
    userEvent.click(screen.getByText("Friday"));
    userEvent.click(screen.getByText("Update filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      values: [3, 5],
      unit: "day-of-week",
    });
  });
});
