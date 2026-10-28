import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  DATE_PICKER_OPERATORS,
  DATE_PICKER_UNITS,
} from "metabase/querying/common/constants";
import type {
  DatePickerOperator,
  DatePickerUnit,
  DatePickerValue,
} from "metabase/querying/common/types";

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

async function selectOperator(from: string, to: string) {
  await userEvent.click(screen.getByDisplayValue(from));
  await userEvent.click(screen.getByRole("option", { name: to }));
}

describe("SimpleDatePicker", () => {
  it("should list all operators with 'All time' selected by default", async () => {
    setup();

    await userEvent.click(screen.getByDisplayValue("All time"));

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "All time",
      "Previous",
      "Next",
      "Current",
      "Before",
      "After",
      "On",
      "Between",
    ]);
    expect(screen.getByRole("option", { name: "All time" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
  });

  it("should submit a past value that includes the current day", async () => {
    const { onChange } = setup();

    await selectOperator("All time", "Previous");
    expect(screen.getByLabelText("Interval")).toHaveValue("30");
    expect(screen.getByRole("textbox", { name: "Unit" })).toHaveValue("days");

    const includeSwitch = screen.getByLabelText("Include today");
    expect(includeSwitch).not.toBeChecked();
    await userEvent.click(includeSwitch);
    expect(includeSwitch).toBeChecked();
    await userEvent.click(screen.getByText("Apply"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: -30,
      unit: "day",
      options: { includeCurrent: true },
    });
  });

  it("should preserve the 'Include current' switch when changing the unit or the direction", async () => {
    const { onChange } = setup({
      value: {
        type: "relative",
        value: 30,
        unit: "year",
        options: { includeCurrent: true },
      },
    });

    expect(screen.getByLabelText("Include this year")).toBeChecked();

    await userEvent.click(screen.getByRole("textbox", { name: "Unit" }));
    await userEvent.click(screen.getByRole("option", { name: "quarters" }));
    expect(screen.getByLabelText("Include this quarter")).toBeChecked();

    await selectOperator("Next", "Previous");
    expect(screen.getByLabelText("Include this quarter")).toBeChecked();

    await userEvent.click(screen.getByLabelText("Include this quarter"));
    await selectOperator("Previous", "Next");
    expect(screen.getByLabelText("Include this quarter")).not.toBeChecked();
    await userEvent.click(screen.getByText("Apply"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: 30,
      unit: "quarter",
      options: { includeCurrent: false },
    });
  });

  it("should reset the 'Include current' switch after switching to the `Current` relative date", async () => {
    setup({
      value: {
        type: "relative",
        value: 30,
        unit: "year",
        options: { includeCurrent: true },
      },
    });

    await selectOperator("Next", "Current");
    expect(screen.queryByLabelText(/^Include/)).not.toBeInTheDocument();

    await selectOperator("Current", "Previous");
    expect(screen.getByLabelText("Include this year")).not.toBeChecked();
  });

  it("should be able change and submit the value", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByDisplayValue("All time"));
    await userEvent.click(screen.getByText("Current"));
    await userEvent.click(screen.getByText("Day"));
    await userEvent.click(screen.getByText("Month"));
    await userEvent.click(screen.getByText("Apply"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: 0,
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
