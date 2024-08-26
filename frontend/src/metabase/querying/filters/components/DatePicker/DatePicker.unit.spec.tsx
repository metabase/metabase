import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { DatePicker } from "./DatePicker";
import type { DatePickerValue } from "./types";

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
  it("should add a filter via shortcut", async () => {
    const { onChange } = setup({ isNew: true });

    await userEvent.click(screen.getByText("Today"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: "current",
      unit: "day",
    });
  });

  it("should add a specific date filter", async () => {
    const { onChange } = setup({ isNew: true });

    await userEvent.click(screen.getByText("Specific dates…"));
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

  it("should update a specific date filter", async () => {
    const { onChange } = setup({
      value: {
        type: "specific",
        operator: ">",
        values: [new Date(2020, 1, 15)],
        hasTime: false,
      },
    });

    await userEvent.click(screen.getByText("20"));
    await userEvent.click(screen.getByText("Update filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "specific",
      operator: ">",
      values: [new Date(2020, 1, 20)],
      hasTime: false,
    });
  });

  it("should add a relative date filter", async () => {
    const { onChange } = setup({ isNew: true });

    await userEvent.click(screen.getByText("Relative dates…"));
    await userEvent.clear(screen.getByLabelText("Interval"));
    await userEvent.type(screen.getByLabelText("Interval"), "20");
    await userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: -20,
      unit: "day",
      offsetValue: undefined,
      offsetUnit: undefined,
    });
  });

  it("should update a relative date filter", async () => {
    const { onChange } = setup({
      value: {
        type: "relative",
        value: -20,
        unit: "day",
        offsetValue: undefined,
        offsetUnit: undefined,
      },
    });

    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("Update filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: 20,
      unit: "day",
      offsetValue: undefined,
      offsetUnit: undefined,
    });
  });

  it("should add an exclude date filter", async () => {
    const { onChange } = setup({ isNew: true });

    await userEvent.click(screen.getByText("Exclude…"));
    await userEvent.click(screen.getByText("Days of the week…"));
    await userEvent.click(screen.getByText("Monday"));
    await userEvent.click(screen.getByText("Add filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      values: [1],
      unit: "day-of-week",
    });
  });

  it("should update an exclude date filter", async () => {
    const { onChange } = setup({
      value: {
        type: "exclude",
        operator: "!=",
        values: [1],
        unit: "day-of-week",
      },
    });

    await userEvent.click(screen.getByText("Monday"));
    await userEvent.click(screen.getByText("Wednesday"));
    await userEvent.click(screen.getByText("Friday"));
    await userEvent.click(screen.getByText("Update filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      values: [3, 5],
      unit: "day-of-week",
    });
  });
});
