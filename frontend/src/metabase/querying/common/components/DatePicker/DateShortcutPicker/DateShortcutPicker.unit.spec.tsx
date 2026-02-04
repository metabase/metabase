import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import {
  DATE_PICKER_DIRECTIONS,
  DATE_PICKER_OPERATORS,
  DATE_PICKER_SHORTCUTS,
} from "../../../constants";
import type {
  DatePickerOperator,
  DatePickerShortcut,
  RelativeIntervalDirection,
} from "../../../types";

import { DateShortcutPicker } from "./DateShortcutPicker";

interface SetupOpts {
  availableOperators?: DatePickerOperator[];
  availableShortcuts?: DatePickerShortcut[];
  availableDirections?: RelativeIntervalDirection[];
}

function setup({
  availableOperators = DATE_PICKER_OPERATORS,
  availableShortcuts = DATE_PICKER_SHORTCUTS,
  availableDirections = DATE_PICKER_DIRECTIONS,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onSelectType = jest.fn();

  renderWithProviders(
    <DateShortcutPicker
      availableOperators={availableOperators}
      availableShortcuts={availableShortcuts}
      availableDirections={availableDirections}
      onChange={onChange}
      onSelectType={onSelectType}
    />,
  );

  return { onChange, onSelectType };
}

describe("DateShortcutPicker", () => {
  it("should be able to create a filter via shortcuts", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByText("Today"));
    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: 0,
      unit: "day",
    });
  });

  it("should be able to navigate to a more specific filter type", async () => {
    const { onSelectType } = setup();
    await userEvent.click(screen.getByText("Fixed date range…"));
    expect(onSelectType).toHaveBeenCalledWith("specific");
  });

  it("should be able to filter shortcuts based on current interval directions", () => {
    setup({ availableDirections: ["current"] });
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.queryByText("Yesterday")).not.toBeInTheDocument();
    expect(screen.queryByText("Previous week")).not.toBeInTheDocument();
    expect(screen.queryByText("Previous month")).not.toBeInTheDocument();
  });

  it("should be able to filter shortcuts based on current and future interval directions", () => {
    setup({ availableDirections: ["current", "future"] });
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.queryByText("Yesterday")).not.toBeInTheDocument();
    expect(screen.queryByText("Previous week")).not.toBeInTheDocument();
    expect(screen.queryByText("Previous month")).not.toBeInTheDocument();
  });

  it("should be able to filter shortcuts based on past and current interval directions", () => {
    setup({ availableDirections: ["past", "current"] });
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
    expect(screen.getByText("Previous week")).toBeInTheDocument();
    expect(screen.getByText("Previous month")).toBeInTheDocument();
  });
});
