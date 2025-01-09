import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { RelativeDatePickerValue } from "metabase/querying/filters/types";

import { RelativeDateShortcutPicker } from "./RelativeDateShortcutPicker";

type TestCase = {
  label: string;
  value: RelativeDatePickerValue;
};

const TEST_CASES: TestCase[] = [
  {
    label: "Today",
    value: { type: "relative", value: "current", unit: "day" },
  },
  {
    label: "Yesterday",
    value: { type: "relative", value: -1, unit: "day" },
  },
  {
    label: "Previous 7 days",
    value: { type: "relative", value: -7, unit: "day" },
  },
  {
    label: "Previous 30 days",
    value: { type: "relative", value: -30, unit: "day" },
  },
];

type SetupOpts = {
  value?: RelativeDatePickerValue;
};

function setup({ value }: SetupOpts = {}) {
  const onChange = jest.fn();

  renderWithProviders(
    <RelativeDateShortcutPicker value={value} onChange={onChange} />,
  );

  return { onChange };
}

describe("RelativeDateShortcutPicker", () => {
  it.each(TEST_CASES)(
    'should be able to select "$label"',
    async ({ label, value }) => {
      const { onChange } = setup();
      await userEvent.click(screen.getByRole("button", { name: label }));
      expect(onChange).toHaveBeenCalledWith(value);
    },
  );

  it.each(TEST_CASES)(
    'should highlight the selected "$label"',
    async ({ label, value }) => {
      setup({ value });
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    },
  );
});
