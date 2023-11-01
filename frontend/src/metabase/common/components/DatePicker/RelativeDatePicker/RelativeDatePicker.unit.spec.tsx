import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "__support__/ui";
import type { RelativeDatePickerValue } from "../types";
import { RelativeDatePicker } from "./RelativeDatePicker";

const TABS = ["Past", "Current", "Next"];
const TAB_CASES = TABS.flatMap(fromTab => TABS.map(toTab => [fromTab, toTab]));

interface SetupOpts {
  value?: RelativeDatePickerValue;
  canUseRelativeOffsets?: boolean;
  isNew?: boolean;
}

function setup({
  value,
  canUseRelativeOffsets = false,
  isNew = false,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onBack = jest.fn();

  renderWithProviders(
    <RelativeDatePicker
      value={value}
      canUseRelativeOffsets={canUseRelativeOffsets}
      isNew={isNew}
      onChange={onChange}
      onBack={onBack}
    />,
  );

  return { onChange, onBack };
}

describe("RelativeDatePicker", () => {
  it.each(TAB_CASES)(
    "should allow switching between %s to %s tab",
    (fromTabName, toTabName) => {
      setup();

      const fromTab = screen.getByRole("tab", { name: fromTabName });
      userEvent.click(fromTab);
      expect(fromTab).toHaveAttribute("aria-selected", "true");

      const toTab = screen.getByRole("tab", { name: toTabName });
      userEvent.click(toTab);
      expect(toTab).toHaveAttribute("aria-selected", "true");
    },
  );
});
