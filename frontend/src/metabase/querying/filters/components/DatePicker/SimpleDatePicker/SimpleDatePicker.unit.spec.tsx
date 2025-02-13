import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  DATE_PICKER_OPERATORS,
  DATE_PICKER_UNITS,
} from "metabase/querying/filters/constants";
import type {
  DatePickerOperator,
  DatePickerUnit,
  DatePickerValue,
} from "metabase/querying/filters/types";

import { SimpleDatePicker } from "./SimpleDatePicker";

interface SetupOpts {
  value?: DatePickerValue;
  availableOperators?: DatePickerOperator[];
  availableUnits?: DatePickerUnit[];
}

function setup({
  value,
  availableOperators = DATE_PICKER_OPERATORS,
  availableUnits = DATE_PICKER_UNITS,
}: SetupOpts = {}) {
  const onChange = jest.fn();

  renderWithProviders(
    <SimpleDatePicker
      value={value}
      availableOperators={availableOperators}
      availableUnits={availableUnits}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("SimpleDatePicker", () => {
  it("should be able change and submit the value", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByDisplayValue("All time"));
    await userEvent.click(screen.getByText("Current"));
    await userEvent.click(screen.getByText("Day"));
    await userEvent.click(screen.getByText("Month"));
    await userEvent.click(screen.getByText("Apply"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: "current",
      unit: "month",
    });
  });

  it("should not show 'Include current' switch by default", async () => {
    setup();

    await userEvent.click(screen.getByDisplayValue("All time"));
    expect(screen.queryByLabelText(/^Include/)).not.toBeInTheDocument();
  });

  it("should not show 'Include current' switch by for the specific date value", async () => {
    setup();

    await userEvent.click(screen.getByDisplayValue("All time"));
    await userEvent.click(screen.getByText("Between"));
    expect(screen.queryByLabelText(/^Include/)).not.toBeInTheDocument();
  });

  it("should not show 'Include current' switch by for the `Current` relative date", async () => {
    setup();

    await userEvent.click(screen.getByDisplayValue("All time"));
    await userEvent.click(screen.getByText("Current"));
    expect(screen.queryByLabelText(/^Include/)).not.toBeInTheDocument();
  });

  it("should show 'Include current' switch and work for the relative `Previous` or `Next`", async () => {
    setup({
      value: {
        type: "relative",
        value: 1,
        unit: "month",
      },
    });

    expect(screen.getByDisplayValue("Next")).toBeInTheDocument();
    expect(screen.getByLabelText("Include this month")).toBeInTheDocument();
  });
});
