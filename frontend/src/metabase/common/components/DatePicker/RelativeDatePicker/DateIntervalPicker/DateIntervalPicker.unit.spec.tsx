import userEvent from "@testing-library/user-event";
import { render, screen } from "__support__/ui";
import type { DateIntervalValue, IntervalDirection } from "../types";
import { DateIntervalPicker } from "./DateIntervalPicker";

function getDefaultValue(direction: IntervalDirection): DateIntervalValue {
  return {
    type: "relative",
    value: direction === "last" ? -30 : 30,
    unit: "day",
  };
}

interface SetupOpts {
  value: DateIntervalValue;
  isNew?: boolean;
  canUseRelativeOffsets?: boolean;
}

function setup({
  value,
  isNew = false,
  canUseRelativeOffsets = false,
}: SetupOpts) {
  const onChange = jest.fn();
  const onSubmit = jest.fn();

  render(
    <DateIntervalPicker
      value={value}
      isNew={isNew}
      canUseRelativeOffsets={canUseRelativeOffsets}
      onChange={onChange}
      onSubmit={onSubmit}
    />,
  );

  return { onChange, onSubmit };
}

describe("DateIntervalPicker", () => {
  describe.each<IntervalDirection>(["last", "next"])("%s", direction => {
    it("should change the interval", () => {
      const { onChange } = setup({
        value: getDefaultValue(direction),
      });

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "20");

      expect(onChange).toHaveBeenLastCalledWith({
        type: "relative",
        value: direction === "last" ? -20 : 20,
        unit: "day",
      });
    });

    it("should change the interval with a negative value", () => {
      const { onChange } = setup({
        value: getDefaultValue(direction),
      });

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "-10");

      expect(onChange).toHaveBeenLastCalledWith({
        type: "relative",
        value: direction === "last" ? -10 : 10,
        unit: "day",
      });
    });

    it("should coerce zero", () => {
      const { onChange } = setup({
        value: getDefaultValue(direction),
      });

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "0");
      userEvent.tab();

      expect(onChange).toHaveBeenLastCalledWith({
        type: "relative",
        value: direction === "last" ? -1 : 1,
        unit: "day",
      });
    });

    it("should ignore empty values", () => {
      const { onChange } = setup({
        value: getDefaultValue(direction),
      });

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.tab();

      expect(input).toHaveValue("30");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should ignore invalid values", () => {
      const { onChange } = setup({
        value: getDefaultValue(direction),
      });

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "abc");
      userEvent.tab();

      expect(input).toHaveValue("30");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should allow to change the unit", () => {
      const { onChange } = setup({
        value: getDefaultValue(direction),
      });

      userEvent.click(screen.getByLabelText("Unit"));
      userEvent.click(screen.getByText("years"));

      expect(onChange).toHaveBeenCalledWith({
        type: "relative",
        value: direction === "last" ? -30 : 30,
        unit: "year",
      });
    });

    it("should allow to include the current unit", async () => {
      const { onChange } = setup({
        value: getDefaultValue(direction),
      });

      userEvent.click(screen.getByLabelText("Options"));
      userEvent.click(await screen.findByText("Include today"));

      expect(onChange).toHaveBeenCalledWith({
        type: "relative",
        value: direction === "last" ? -30 : 30,
        unit: "day",
        options: {
          "include-current": true,
        },
      });
    });

    it("should not allow to add relative offsets by default", async () => {
      setup({
        value: getDefaultValue(direction),
      });

      userEvent.click(screen.getByLabelText("Options"));
      expect(await screen.findByText("Include today")).toBeInTheDocument();
      expect(screen.queryByText("Starting from…")).not.toBeInTheDocument();
    });

    it("should allow to a relative offset if enabled", async () => {
      const { onChange } = setup({
        value: getDefaultValue(direction),
        canUseRelativeOffsets: true,
      });

      userEvent.click(screen.getByLabelText("Options"));
      userEvent.click(await screen.findByText("Starting from…"));

      expect(onChange).toHaveBeenLastCalledWith({
        type: "relative",
        value: direction === "last" ? -30 : 30,
        unit: "day",
        offsetUnit: "day",
        offsetValue: direction === "last" ? -7 : 7,
        options: undefined,
      });
    });
  });
});
