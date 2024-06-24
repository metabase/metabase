import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";

import { DATE_PICKER_OPERATORS } from "../constants";
import type { DatePickerValue, DatePickerOperator } from "../types";

import { DateOperatorPicker } from "./DateOperatorPicker";

interface SetupOpts {
  value?: DatePickerValue;
  availableOperators?: ReadonlyArray<DatePickerOperator>;
}

function setup({
  value,
  availableOperators = DATE_PICKER_OPERATORS,
}: SetupOpts = {}) {
  const onChange = jest.fn();

  renderWithProviders(
    <DateOperatorPicker
      value={value}
      availableOperators={availableOperators}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("DateOperatorPicker", () => {
  it("should be able to change the option type", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByDisplayValue("All time"));
    await userEvent.click(screen.getByText("Current"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: "current",
      unit: "day",
    });
  });

  it("should be able to change a specific date value", async () => {
    const { onChange } = setup({
      value: {
        type: "specific",
        operator: "=",
        values: [new Date(2015, 1, 10)],
      },
    });

    await userEvent.click(screen.getByText("15"));

    expect(onChange).toHaveBeenCalledWith({
      type: "specific",
      operator: "=",
      values: [new Date(2015, 1, 15)],
    });
  });

  it("should be able to change a relative date value", async () => {
    const { onChange } = setup({
      value: {
        type: "relative",
        value: 1,
        unit: "month",
      },
    });

    await userEvent.type(screen.getByLabelText("Interval"), "2");

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: 12,
      unit: "month",
    });
  });

  describe("Include current switch", () => {
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

    it("should turn the 'Include current' switch on and register that change", async () => {
      const { onChange } = setup({
        value: {
          type: "relative",
          value: 1,
          unit: "month",
        },
      });

      await userEvent.click(screen.getByLabelText("Include this month"));

      expect(onChange).toHaveBeenCalledWith({
        options: {
          "include-current": true,
        },
        type: "relative",
        value: 1,
        unit: "month",
      });
    });

    it("should turn the 'Include current' switch off and register that change", async () => {
      const { onChange } = setup({
        value: {
          options: {
            "include-current": true,
          },
          type: "relative",
          value: 1,
          unit: "month",
        },
      });

      await userEvent.click(screen.getByLabelText("Include this month"));

      expect(onChange).toHaveBeenCalledWith({
        options: {
          "include-current": false,
        },
        type: "relative",
        value: 1,
        unit: "month",
      });
    });
  });
});
