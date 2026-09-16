import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import type { DateRangeValue } from "../DateRangeCalendar/DateRangeCalendar";

import {
  DateRangePopover,
  type DateRangePopoverProps,
} from "./DateRangePopover";

type SetupOpts = Pick<
  DateRangePopoverProps,
  "opened" | "onOpenedChange" | "closeOnSelect"
> & {
  value: DateRangeValue;
};

const setup = ({ value, ...popoverProps }: SetupOpts) => {
  const onChange = jest.fn();
  const onTriggerClick = jest.fn();

  // Controlled so a completed range shows in the calendar the way it would in
  // an app, where `onChange` writes straight back into `value`.
  const Wrapper = () => {
    const [range, setRange] = useState(value);

    return (
      <DateRangePopover
        {...popoverProps}
        value={range}
        numberOfColumns={1}
        onChange={(next) => {
          onChange(next);
          setRange(next);
        }}
      >
        <button onClick={onTriggerClick}>Custom</button>
      </DateRangePopover>
    );
  };

  renderWithProviders(<Wrapper />);

  return { onChange, onTriggerClick };
};

const trigger = () => screen.getByRole("button", { name: "Custom" });

// The calendar header is the least ambiguous sign the dropdown is mounted —
// day numbers appear in every month, and nothing else on the page shows one.
const calendar = () => screen.queryByText("March 2026");

describe("DateRangePopover", () => {
  it("opens on the trigger and calls the trigger's own handler", async () => {
    const { onTriggerClick } = setup({ value: ["2026-03-10", null] });

    expect(calendar()).not.toBeInTheDocument();

    await userEvent.click(trigger());

    expect(await screen.findByText("March 2026")).toBeInTheDocument();
    expect(onTriggerClick).toHaveBeenCalledTimes(1);
  });

  it("stays open on a half-picked range and closes once both ends are set", async () => {
    const { onChange } = setup({ value: ["2026-03-10", "2026-03-20"] });

    await userEvent.click(trigger());
    await userEvent.click(await screen.findByText("15"));

    expect(onChange).toHaveBeenLastCalledWith(["2026-03-15", null]);
    expect(calendar()).toBeInTheDocument();

    await userEvent.click(screen.getByText("25"));

    expect(onChange).toHaveBeenLastCalledWith(["2026-03-15", "2026-03-25"]);
    await waitFor(() => expect(calendar()).not.toBeInTheDocument());
  });

  it("keeps the popover open when closeOnSelect is off", async () => {
    const { onChange } = setup({
      value: ["2026-03-10", null],
      closeOnSelect: false,
    });

    await userEvent.click(trigger());
    await userEvent.click(await screen.findByText("20"));

    expect(onChange).toHaveBeenLastCalledWith(["2026-03-10", "2026-03-20"]);
    expect(calendar()).toBeInTheDocument();
  });

  // Mantine's `Popover.Target` adds its own toggling `onClick` only to an
  // uncontrolled popover; this one is always controlled, so the cloned handler
  // is the single toggle. One click, one transition — not two.
  it("reports exactly one transition per click when controlled", async () => {
    const onOpenedChange = jest.fn();
    setup({ value: ["2026-03-10", null], opened: false, onOpenedChange });

    await userEvent.click(trigger());

    expect(onOpenedChange).toHaveBeenCalledTimes(1);
    expect(onOpenedChange).toHaveBeenCalledWith(true);
    expect(calendar()).not.toBeInTheDocument();
  });
});
