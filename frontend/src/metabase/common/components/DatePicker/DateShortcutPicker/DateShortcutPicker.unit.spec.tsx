import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import { DATE_PICKER_OPERATORS, DATE_PICKER_SHORTCUTS } from "../constants";
import type { DatePickerOperator, DatePickerShortcut } from "../types";
import { DateShortcutPicker } from "./DateShortcutPicker";

interface SetupOpts {
  availableOperators?: ReadonlyArray<DatePickerOperator>;
  availableShortcuts?: ReadonlyArray<DatePickerShortcut>;
}

function setup({
  availableOperators = DATE_PICKER_OPERATORS,
  availableShortcuts = DATE_PICKER_SHORTCUTS,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onSelectType = jest.fn();

  renderWithProviders(
    <DateShortcutPicker
      availableOperators={availableOperators}
      availableShortcuts={availableShortcuts}
      onChange={onChange}
      onSelectType={onSelectType}
    />,
  );

  return { onChange, onSelectType };
}

describe("DateShortcutPicker", () => {
  it("should be able to create a filter via shortcuts", () => {
    const { onChange } = setup();
    userEvent.click(screen.getByText("Today"));
    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: "current",
      unit: "day",
    });
  });

  it("should be able to navigate to a more specific filter type", () => {
    const { onSelectType } = setup();
    userEvent.click(screen.getByText("Specific dates…"));
    expect(onSelectType).toHaveBeenCalledWith("specific");
  });
});
