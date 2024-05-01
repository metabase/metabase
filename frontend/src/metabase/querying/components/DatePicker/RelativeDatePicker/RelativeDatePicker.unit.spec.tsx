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
    async (fromTabName, toTabName) => {
      setup();

      const fromTab = screen.getByRole("tab", { name: fromTabName });
      await userEvent.click(fromTab);
      expect(fromTab).toHaveAttribute("aria-selected", "true");

      const toTab = screen.getByRole("tab", { name: toTabName });
      await userEvent.click(toTab);
      expect(toTab).toHaveAttribute("aria-selected", "true");
    },
  );

  it("should not lose values when navigating from Past to Next tab", async () => {
    setup();

    await userEvent.clear(screen.getByLabelText("Interval"));
    await userEvent.type(screen.getByLabelText("Interval"), "20");
    await userEvent.click(screen.getByLabelText("Next"));
    expect(screen.getByLabelText("Interval")).toHaveValue("20");

    await userEvent.click(screen.getByLabelText("Past"));
    expect(screen.getByLabelText("Interval")).toHaveValue("20");
  });

  it("should not lose offset values when navigating from Past to Next tab", async () => {
    setup({
      canUseRelativeOffsets: true,
    });

    await userEvent.click(screen.getByLabelText("Options"));
    await userEvent.click(await screen.findByText("Starting from…"));
    await userEvent.clear(screen.getByLabelText("Starting from interval"));
    await userEvent.type(screen.getByLabelText("Starting from interval"), "20");
    await userEvent.click(screen.getByLabelText("Next"));
    expect(screen.getByLabelText("Starting from interval")).toHaveValue("20");

    await userEvent.click(screen.getByLabelText("Past"));
    expect(screen.getByLabelText("Starting from interval")).toHaveValue("20");
  });

  it("should allow to submit a current value", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByText("Current"));
    await userEvent.click(screen.getByText("Week"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: "current",
      unit: "week",
    });
  });

  it("should allow to submit a past value", async () => {
    const { onChange } = setup();

    const input = screen.getByLabelText("Interval");
    await userEvent.clear(input);
    await userEvent.type(input, "20");
    await userEvent.click(screen.getByText("Update filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: -20,
      unit: "day",
    });
  });

  it("should allow to submit a past value with an offset", async () => {
    const { onChange } = setup({
      canUseRelativeOffsets: true,
    });

    await userEvent.click(screen.getByLabelText("Options"));
    await userEvent.click(await screen.findByText("Starting from…"));
    await userEvent.click(screen.getByText("Update filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: -30,
      unit: "day",
      offsetValue: -7,
      offsetUnit: "day",
      options: undefined,
    });
  });

  it("should allow to submit a next value", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByText("Next"));
    const input = screen.getByLabelText("Interval");
    await userEvent.clear(input);
    await userEvent.type(input, "20");
    await userEvent.click(screen.getByText("Update filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: 20,
      unit: "day",
    });
  });

  it("should allow to submit a next value with an offset", async () => {
    const { onChange } = setup({
      canUseRelativeOffsets: true,
    });

    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByLabelText("Options"));
    await userEvent.click(await screen.findByText("Starting from…"));
    await userEvent.click(screen.getByText("Update filter"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: 30,
      unit: "day",
      offsetValue: 7,
      offsetUnit: "day",
      options: undefined,
    });
  });
});
