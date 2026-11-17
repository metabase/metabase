import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { RelativeDatePicker } from "metabase/querying/common/components/DatePicker/RelativeDatePicker";
import { SpecificDatePicker } from "metabase/querying/common/components/DatePicker/SpecificDatePicker";
import {
  DATE_PICKER_DIRECTIONS,
  DATE_PICKER_OPERATORS,
  DATE_PICKER_UNITS,
} from "metabase/querying/common/constants";

import { useDatePickerKeyboard } from "./date-picker-keyboard";

type PickerType = "specific" | "relative";

function Popover({ children }: { children: ReactNode }) {
  const keyboard = useDatePickerKeyboard();
  return (
    <div ref={keyboard.ref} onKeyDown={keyboard.onKeyDown}>
      {children}
    </div>
  );
}

function setup(type: PickerType) {
  const onChange = jest.fn();
  const pickerProps = {
    availableOperators: DATE_PICKER_OPERATORS,
    onBack: jest.fn(),
    onChange,
  };
  const picker = {
    specific: (
      <SpecificDatePicker {...pickerProps} availableUnits={DATE_PICKER_UNITS} />
    ),
    relative: (
      <RelativeDatePicker
        {...pickerProps}
        availableUnits={DATE_PICKER_UNITS}
        availableDirections={DATE_PICKER_DIRECTIONS}
        value={undefined}
      />
    ),
  }[type];
  renderWithProviders(<Popover>{picker}</Popover>, {
    storeInitialState: createMockState({
      settings: mockSettings({
        "custom-formatting": { "type/Temporal": { time_style: "h A" } },
      }),
    }),
  });
  return { onChange };
}

describe("useDatePickerKeyboard", () => {
  it("focuses the start date of a fixed date range, Tab goes to the end date, and Enter applies", async () => {
    const { onChange } = setup("specific");
    expect(screen.getByLabelText("Start date")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText("End date")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "specific", operator: "between" }),
    );
  });

  it("focuses the interval of a relative date range, Tab goes to the unit, and Enter applies", async () => {
    const { onChange } = setup("relative");
    expect(screen.getByLabelText("Interval")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("textbox", { name: "Unit" })).toHaveFocus();
    await userEvent.click(screen.getByLabelText("Interval"));
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "relative" }),
    );
  });
});
