import userEvent from "@testing-library/user-event";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { DATE_PICKER_UNITS } from "metabase/querying/common/constants";
import type { ExcludeDatePickerValue } from "metabase/querying/common/types";

import { ExcludeDateValueInput } from "./ExcludeDateValueInput";

function setup(value?: ExcludeDatePickerValue) {
  const onChange = jest.fn();
  const onBack = jest.fn();
  const onDraftChange = jest.fn();
  renderWithProviders(
    <ExcludeDateValueInput
      availableUnits={DATE_PICKER_UNITS}
      value={value}
      onChange={onChange}
      onBack={onBack}
      onCancel={jest.fn()}
      onDraftChange={onDraftChange}
    />,
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "custom-formatting": { "type/Temporal": { time_style: "h A" } },
        }),
      }),
    },
  );
  return { onChange, onBack, onDraftChange };
}

describe("ExcludeDateValueInput", () => {
  it("picks the days of the week and excludes the checked days with Enter", async () => {
    const { onChange } = setup();
    expect(
      screen.getByRole("option", { name: "Days of the week…" }),
    ).toHaveAttribute("data-combobox-selected");
    await userEvent.keyboard("{Enter}");

    expect(screen.getByRole("option", { name: "Monday" })).toBeInTheDocument();
    // "Select all", then Monday and Tuesday.
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}{ArrowDown}{Enter}");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      unit: "day-of-week",
      values: [1, 2],
    });
  });

  it("applies with Tab, and a typed text finds a value", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByText("Months of the year…"));
    // Tab picks the first match of the text, then applies.
    await userEvent.type(screen.getByRole("textbox"), "mar");
    await userEvent.keyboard("{Tab}");
    expect(screen.getByRole("textbox")).toHaveValue("");
    await userEvent.keyboard("{Tab}");
    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "!=",
      unit: "month-of-year",
      values: [3],
    });
  });

  it("excludes empty values at once: the values that are not null", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByText("Empty values"));
    expect(onChange).toHaveBeenCalledWith({
      type: "exclude",
      operator: "not-null",
      values: [],
    });
  });

  it("goes back with Backspace in the empty input, to the kinds of values, then to the operators", async () => {
    const { onBack } = setup({
      type: "exclude",
      operator: "!=",
      unit: "day-of-week",
      values: [1],
    });
    // Monday shows as a token in the pill, and checked in the list.
    expect(screen.getByLabelText("Remove value")).toBeInTheDocument();
    // The first Backspace removes Monday, the next goes back to the kinds.
    await userEvent.keyboard("{Backspace}{Backspace}");
    expect(
      screen.getByRole("option", { name: "Days of the week…" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Backspace}");
    expect(onBack).toHaveBeenCalled();
  });

  it("goes back from the values of a new filter to the kinds of values", async () => {
    setup();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("option", { name: "Monday" })).toBeInTheDocument();
    await userEvent.keyboard("{Backspace}");
    expect(
      screen.getByRole("option", { name: "Days of the week…" }),
    ).toBeInTheDocument();
  });

  it("reports the checked values to the pill, so that a click outside applies them", async () => {
    const { onDraftChange } = setup();
    await userEvent.click(screen.getByText("Quarters of the year…"));
    // The keys, not clicks: jsdom has no CSS, so a click on a label clicks
    // its checkbox too, which the pill's CSS prevents.
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    expect(onDraftChange).toHaveBeenLastCalledWith({
      type: "exclude",
      operator: "!=",
      unit: "quarter-of-year",
      values: [2],
    });
    await userEvent.keyboard("{Enter}");
    expect(onDraftChange).toHaveBeenLastCalledWith(undefined);
  });
});
