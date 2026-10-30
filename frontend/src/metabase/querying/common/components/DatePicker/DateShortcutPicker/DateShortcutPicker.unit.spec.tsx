import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  DATE_PICKER_DIRECTIONS,
  DATE_PICKER_OPERATORS,
  DATE_PICKER_SHORTCUTS,
} from "metabase/querying/common/constants";
import type {
  DateFilterValue,
  DatePickerOperator,
  DatePickerShortcut,
  RelativeIntervalDirection,
} from "metabase/querying/common/types";

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

type ShortcutCase = {
  label: string;
  value: DateFilterValue;
};

describe("DateShortcutPicker", () => {
  it.each<ShortcutCase>([
    { label: "Today", value: { type: "relative", value: 0, unit: "day" } },
    { label: "Yesterday", value: { type: "relative", value: -1, unit: "day" } },
    {
      label: "Previous week",
      value: { type: "relative", value: -1, unit: "week" },
    },
    {
      label: "Previous 7 days",
      value: { type: "relative", value: -7, unit: "day" },
    },
    {
      label: "Previous 30 days",
      value: { type: "relative", value: -30, unit: "day" },
    },
    {
      label: "Previous month",
      value: { type: "relative", value: -1, unit: "month" },
    },
    {
      label: "Previous 3 months",
      value: { type: "relative", value: -3, unit: "month" },
    },
    {
      label: "Previous 12 months",
      value: { type: "relative", value: -12, unit: "month" },
    },
  ])(
    "should be able to create a filter via the $label shortcut",
    async ({ label, value }) => {
      const { onChange } = setup();
      await userEvent.click(screen.getByText(label));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(value);
    },
  );

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
