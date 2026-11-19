import userEvent from "@testing-library/user-event";

import { act, renderWithProviders, screen } from "__support__/ui";
import { DATE_PICKER_UNITS } from "metabase/querying/common/constants";
import type {
  DatePickerUnit,
  RelativeDatePickerValue,
  RelativeIntervalDirection,
} from "metabase/querying/common/types";

import { SimpleDateIntervalPicker } from "./SimpleDateIntervalPicker";

function getDefaultValue(
  direction: RelativeIntervalDirection,
): RelativeDatePickerValue {
  return {
    type: "relative",
    value: direction === "past" ? -30 : 30,
    unit: "day",
  };
}

interface SetupOpts {
  value: RelativeDatePickerValue;
  availableUnits?: DatePickerUnit[];
}

let user: ReturnType<typeof userEvent.setup>;

function setup({ value, availableUnits = DATE_PICKER_UNITS }: SetupOpts) {
  user = userEvent.setup({
    advanceTimers: async (delay) => {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(delay);
      });
    },
    writeToClipboard: false,
  });
  const onChange = jest.fn();

  renderWithProviders(
    <SimpleDateIntervalPicker
      value={value}
      availableUnits={availableUnits}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("SimpleDateIntervalPicker", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  describe.each<RelativeIntervalDirection>(["past", "future"])(
    "%s",
    (direction) => {
      const defaultValue = getDefaultValue(direction);

      it("should change the interval", async () => {
        const { onChange } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        await user.clear(input);
        await user.type(input, "20");

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          value: direction === "past" ? -20 : 20,
        });
      });

      it("should change the interval with a negative value", async () => {
        const { onChange } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        await user.clear(input);
        await user.type(input, "-10");

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          value: direction === "past" ? -10 : 10,
        });
      });

      it("should coerce zero", async () => {
        const { onChange } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        await user.clear(input);
        await user.type(input, "0");
        await user.tab();

        expect(onChange).toHaveBeenLastCalledWith({
          ...defaultValue,
          value: direction === "past" ? -1 : 1,
        });
      });

      it("should ignore empty values", async () => {
        const { onChange } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        await user.clear(input);
        await user.tab();

        expect(input).toHaveValue("30");
        expect(onChange).not.toHaveBeenCalled();
      });

      it("should ignore invalid values", async () => {
        const { onChange } = setup({
          value: defaultValue,
        });

        const input = screen.getByLabelText("Interval");
        await user.clear(input);
        await user.type(input, "abc");
        await user.tab();

        expect(input).toHaveValue("30");
        expect(onChange).not.toHaveBeenCalled();
      });

      it("should allow to change the unit", async () => {
        const { onChange } = setup({
          value: defaultValue,
        });

        await user.click(screen.getByRole("textbox", { name: "Unit" }));
        await user.click(screen.getByText("years"));

        expect(onChange).toHaveBeenCalledWith({
          ...defaultValue,
          unit: "year",
        });
      });
    },
  );

  describe("Include current switch", () => {
    it("should turn the 'Include current' switch on and register that change", async () => {
      const { onChange } = setup({
        value: {
          type: "relative",
          value: 1,
          unit: "month",
        },
      });

      await user.click(screen.getByLabelText("Include this month"));

      expect(onChange).toHaveBeenCalledWith({
        options: {
          includeCurrent: true,
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
            includeCurrent: true,
          },
          type: "relative",
          value: 1,
          unit: "month",
        },
      });

      await user.click(screen.getByLabelText("Include this month"));

      expect(onChange).toHaveBeenCalledWith({
        options: {
          includeCurrent: false,
        },
        type: "relative",
        value: 1,
        unit: "month",
      });
    });
  });
});
