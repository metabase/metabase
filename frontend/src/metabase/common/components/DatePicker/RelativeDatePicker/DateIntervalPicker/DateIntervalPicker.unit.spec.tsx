import userEvent from "@testing-library/user-event";
import { render, screen } from "__support__/ui";
import type { DateIntervalValue } from "../types";
import { DateIntervalPicker } from "./DateIntervalPicker";

const DEFAULT_PAST_VALUE: DateIntervalValue = {
  type: "relative",
  value: -30,
  unit: "day",
};

interface SetupOpts {
  value?: DateIntervalValue;
  isNew?: boolean;
  canUseRelativeOffsets?: boolean;
}

function setup({
  value = DEFAULT_PAST_VALUE,
  isNew = false,
  canUseRelativeOffsets = false,
}: SetupOpts = {}) {
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
  describe("past", () => {
    it("should change the past interval", () => {
      const { onChange } = setup();

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "20");

      expect(onChange).toHaveBeenLastCalledWith({
        type: "relative",
        value: -20,
        unit: "day",
      });
    });

    it("should change the past interval with a negative value", () => {
      const { onChange } = setup();

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "-10");

      expect(onChange).toHaveBeenLastCalledWith({
        type: "relative",
        value: -10,
        unit: "day",
      });
    });

    it("should coerce zero", () => {
      const { onChange } = setup();

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "0");
      userEvent.tab();

      expect(onChange).toHaveBeenLastCalledWith({
        type: "relative",
        value: -1,
        unit: "day",
      });
    });

    it("should ignore empty values", () => {
      const { onChange } = setup();

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.tab();

      expect(input).toHaveValue("30");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should ignore invalid values", () => {
      const { onChange } = setup();

      const input = screen.getByLabelText("Interval");
      userEvent.clear(input);
      userEvent.type(input, "abc");
      userEvent.tab();

      expect(input).toHaveValue("30");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("should allow to change the unit", () => {
      const { onChange } = setup();

      userEvent.click(screen.getByLabelText("Unit"));
      userEvent.click(screen.getByText("years"));

      expect(onChange).toHaveBeenCalledWith({
        type: "relative",
        value: -30,
        unit: "year",
      });
    });

    it("should allow to include the current unit", async () => {
      const { onChange } = setup();

      userEvent.click(screen.getByLabelText("Options"));
      userEvent.click(await screen.findByText("Include today"));

      expect(onChange).toHaveBeenCalledWith({
        type: "relative",
        value: -30,
        unit: "day",
        options: {
          "include-current": true,
        },
      });
    });

    it("should not allow to add relative offsets by default", async () => {
      setup();

      userEvent.click(screen.getByLabelText("Options"));
      expect(await screen.findByText("Include today")).toBeInTheDocument();
      expect(screen.queryByText("Starting from…")).not.toBeInTheDocument();
    });

    it("should allow to a relative offset if enabled", async () => {
      const { onChange } = setup({
        canUseRelativeOffsets: true,
      });

      userEvent.click(screen.getByLabelText("Options"));
      userEvent.click(await screen.findByText("Starting from…"));

      expect(onChange).toHaveBeenLastCalledWith({
        type: "relative",
        value: -30,
        unit: "day",
        offsetUnit: "day",
        offsetValue: -7,
        options: undefined,
      });
    });
  });
});
