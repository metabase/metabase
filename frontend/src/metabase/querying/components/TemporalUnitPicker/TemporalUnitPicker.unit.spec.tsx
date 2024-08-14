import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import {
  TemporalUnitPicker,
  type TemporalUnitItem,
} from "./TemporalUnitPicker";

const DEFAULT_ITEMS: TemporalUnitItem[] = Lib.availableTemporalUnits().map(
  unit => ({
    value: unit,
    label: Lib.describeTemporalUnit(unit),
  }),
);

interface SetupOpts {
  value?: TemporalUnit;
  availableItems?: TemporalUnitItem[];
  canRemove?: boolean;
}

function setup({
  value,
  availableItems = DEFAULT_ITEMS,
  canRemove,
}: SetupOpts = {}) {
  const onChange = jest.fn();
  const onRemove = jest.fn();

  render(
    <TemporalUnitPicker
      value={value}
      availableItems={availableItems}
      canRemove={canRemove}
      onChange={onChange}
      onRemove={onRemove}
    />,
  );

  return { onChange, onRemove };
}

describe("TemporalUnitPicker", () => {
  it("should collapse the list and allow to expand it once", async () => {
    setup();
    expect(getOption("Day")).toBeInTheDocument();
    expect(getOption("Month")).toBeInTheDocument();
    expect(getOption("Year")).toBeInTheDocument();
    expect(queryOption("Day of week")).not.toBeInTheDocument();

    await userEvent.click(getOption("More…"));
    expect(getOption("Day")).toBeInTheDocument();
    expect(getOption("Month")).toBeInTheDocument();
    expect(getOption("Year")).toBeInTheDocument();
    expect(getOption("Day of week")).toBeInTheDocument();
    expect(queryOption("More…")).not.toBeInTheDocument();
  });

  it("should not allow to expand when there are 7 items or less in the list", () => {
    setup({ availableItems: DEFAULT_ITEMS.slice(0, 7) });
    expect(getOption("Year")).toBeInTheDocument();
    expect(queryOption("More…")).not.toBeInTheDocument();
  });

  it("should allow to select an item", async () => {
    const { onChange, onRemove } = setup();
    await userEvent.click(getOption("Year"));
    expect(onChange).toHaveBeenCalledWith("year");
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("should allow to select an item from the collapsed section", async () => {
    const { onChange, onRemove } = setup();
    await userEvent.click(getOption("More…"));
    await userEvent.click(getOption("Day of week"));
    expect(onChange).toHaveBeenCalledWith("day-of-week");
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("should highlight the selected item and not expand if the item is in the expanded section", () => {
    setup({ value: "year" });
    expect(getOption("Year")).toHaveAttribute("aria-selected", "true");
    expect(getOption("More…")).toBeInTheDocument();
    expect(queryOption("Day of week")).not.toBeInTheDocument();
  });

  it("should automatically expand if the selected item is in the collapsed section", () => {
    setup({ value: "minute-of-hour" });
    expect(getOption("Minute of hour")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(queryOption("More…")).not.toBeInTheDocument();
  });

  it("should not allow to remove the unit by default", async () => {
    setup();
    expect(getOption("Day")).toBeInTheDocument();
    expect(queryOption("Don't bin")).not.toBeInTheDocument();

    await userEvent.click(getOption("More…"));
    expect(getOption("Day of week")).toBeInTheDocument();
    expect(queryOption("Don't bin")).not.toBeInTheDocument();
  });

  it("should allow to remove the unit when enabled and expanded", async () => {
    const { onChange, onRemove } = setup({ canRemove: true });
    expect(getOption("Day")).toBeInTheDocument();
    expect(queryOption("Don't bin")).not.toBeInTheDocument();

    await userEvent.click(getOption("More…"));
    expect(getOption("Day of week")).toBeInTheDocument();
    expect(getOption("Don't bin")).not.toHaveAttribute("aria-selected", "true");

    await userEvent.click(getOption("Don't bin"));
    expect(onRemove).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

function getOption(name: string) {
  return screen.getByRole("option", { name });
}

function queryOption(name: string) {
  return screen.queryByRole("option", { name });
}
